import { describe, expect, it } from "vitest";
import {
  classifyGatherables, locateItems, parseCsv, parseCsvRows, parseLua, readQuestieObjects, readQuestieTable,
  recipeItemSources, spellsTaughtByItems, zoneNamesByCount,
} from "./data-lib.mjs";

describe("parseCsvRows", () => {
  it("keeps commas, escaped quotes and newlines inside quoted fields", () => {
    const text = "a,b,c\n1,\"x, y\",\"say \"\"hi\"\"\"\n2,\"line one\nline two\",z\n";
    expect(parseCsvRows(text)).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", "say \"hi\""],
      ["2", "line one\nline two", "z"],
    ]);
  });

  it("handles CRLF, empty fields and a missing final newline", () => {
    expect(parseCsvRows("a,b\r\n,2\r\n3,")).toEqual([["a", "b"], ["", "2"], ["3", ""]]);
  });
});

describe("parseCsv", () => {
  it("maps rows to header names, skips blank lines and the BOM", () => {
    const text = "﻿ID,Name\n1,Silverleaf\n\n2,\"Copper, Bar\"\n";
    expect(parseCsv(text)).toEqual([
      { ID: "1", Name: "Silverleaf" },
      { ID: "2", Name: "Copper, Bar" },
    ]);
  });
});

describe("classifyGatherables", () => {
  const item = (classId, subclassId) => ({ classId, subclassId });
  const items = new Map([
    [1, item(7, 9)], // herb
    [2, item(7, 7)], // metal and stone: no gatherer is known for it any more
    [3, item(9, 9)], // herb-like subclass, wrong class
    [4, item(7, 9)], // herb, created by a recipe
    [5, item(7, 8)], // meat or fish: not classified
  ]);
  const recipe = (profession, reagentIds, created) => ({
    profession,
    ...(created ? { item: created } : {}),
    reagents: reagentIds.map((id) => ({ item: id })),
  });

  it("assigns uncrafted herbs to Herbalism, once, and nothing else", () => {
    const recipes = [recipe("alchemy", [1, 1, 2, 3, 5]), recipe("cooking", [1])];
    expect(classifyGatherables(items, recipes)).toEqual({ herbalism: [1] });
  });

  it("leaves out anything a recipe creates, even when another recipe uses it", () => {
    const recipes = [recipe("alchemy", [], 4), recipe("alchemy", [4, 1])];
    expect(classifyGatherables(items, recipes)).toEqual({ herbalism: [1] });
  });

  it("assigns allow-listed ids whatever their class, even ones a recipe also creates", () => {
    const recipes = [recipe("cooking", [5, 2, 4]), recipe("alchemy", [1], 4)];
    expect(classifyGatherables(items, recipes, { fishing: [5], herbalism: [2, 4] }))
      .toEqual({ fishing: [5], herbalism: [1, 2, 4] });
  });

  it("ignores reagents missing from the item table", () => {
    expect(classifyGatherables(items, [recipe("alchemy", [404])])).toEqual({});
  });
});

describe("parseLua", () => {
  it("reads nested tables, nil placeholders, comments, escapes and keyed entries", () => {
    const text = "{ -- note\n --[[ disabled\n [8] = {} ]] [7] = {'It\\'s',nil,{1,2},{[40]={{1.5,-2},{3,4}}},40},\n"
      + " [objectKeys.name] = \"x\", [9] = zoneIDs.A }";
    const table = parseLua(text);
    const seven = table.map.get(7);
    expect(seven.list[0]).toBe("It's");
    expect(seven.list[1]).toBeNull();
    expect(seven.list[3].map.get(40).list[0].list).toEqual([1.5, -2]);
    expect(table.map.get("objectKeys.name")).toBe("x");
    expect(table.map.get(9)).toEqual({ ref: "zoneIDs.A" });
    expect(table.map.has(8)).toBe(false);
  });

  it("fails loudly on text it does not understand", () => {
    expect(() => parseLua("{ 1, 2")).toThrow(/Lua parse error/);
    expect(() => parseLua("{1} extra")).toThrow(/trailing/);
  });
});

describe("readQuestieObjects", () => {
  const raw = "x = [[return {\n[1] = {\"Peacebloom\",nil,nil,{[1]={{1,1},{2,2}},[2]={{3,3}}},1},\n"
    + "[2] = {\"Chest\",nil,nil,nil,0},\n}]]\n";
  const delta = "return {\n [1] = { -- a\n [objectKeys.spawns] = {[5] = {{1, 1}}},\n [objectKeys.zoneID] = zoneIDs.X,\n"
    + " },\n"
    + " [3] = { [objectKeys.name] = \"Gold Vein\", [objectKeys.spawns] = {[9] = {{1, 1}, {2, 2}}} },\n}\nend\nreturn M";

  it("counts spawns per zone and lets the delta override the raw spawns and add objects", () => {
    const objects = readQuestieObjects(raw, delta);
    expect(objects.get(1)).toEqual({ name: "Peacebloom", zones: new Map([[5, 1]]) });
    expect(objects.get(2).zones.size).toBe(0);
    expect(objects.get(3)).toEqual({ name: "Gold Vein", zones: new Map([[9, 2]]) });
  });
});

describe("readQuestieTable", () => {
  const raw = "x = [[return {\n[1] = {'Recipe: Stew',{7},nil,{2,3}},\n[2] = {'Recipe: Pie'},\n}]]\n";
  const delta = "return {\n [1] = { [itemKeys.vendors_add] = {4}, [itemKeys.npcDrops] = nil },\n"
    + " [5] = { [itemKeys.name] = \"Recipe: Jam\", [itemKeys.vendors] = {6} },\n"
    + " [6] = { [questKeys.requiredRaces] = raceIDs.ORC + raceIDs.TROLL },\n}\nend";

  it("names positional fields, applies delta replacements and _add appends, and adds new entries", () => {
    const items = readQuestieTable(raw, delta, "item", ["name", "npcDrops", "objectDrops", "vendors"]);
    expect(items.get(1)).toMatchObject({ name: "Recipe: Stew", npcDrops: null, objectDrops: null });
    expect(items.get(1).vendors.list).toEqual([2, 3, 4]);
    expect(items.get(2).vendors).toBeNull();
    expect(items.get(5).name).toBe("Recipe: Jam");
    expect(items.get(5).vendors.list).toEqual([6]);
  });

  it("parses sums of names without evaluating them", () => {
    expect(parseLua("{a.B + c.D}").list[0]).toEqual({ sum: [{ ref: "a.B" }, { ref: "c.D" }] });
  });
});

describe("recipeItemSources", () => {
  const list = (...values) => ({ list: values, map: new Map() });
  const spawns = (...zones) => ({ list: [], map: new Map(zones.map((zone) => [zone, list()])) });
  const zones = new Map([[1, "Orgrimmar"], [2, "Durotar"], [3, "Darnassus"], [4, "Tanaris"], [5, "Mulgore"]]);
  const capitals = new Map([["Orgrimmar", "Durotar"], ["Darnassus", "Teldrassil"]]);
  const npcs = new Map([
    [10, { spawns: spawns(1), friendlyToFaction: "H" }],
    [11, { spawns: spawns(2), friendlyToFaction: "H" }],
    [12, { spawns: spawns(3), friendlyToFaction: "A" }],
    [13, { spawns: spawns(4, 99), friendlyToFaction: "AH" }],
    [14, { spawns: null, zoneID: 5, friendlyToFaction: null }],
    [15, { spawns: null, friendlyToFaction: "A" }],
  ]);
  const quests = new Map([[50, { startedBy: list(list(15)) }], [51, { startedBy: list(null, list(7)) }]]);
  const item = (fields) => ({ vendors: null, questRewards: null, npcDrops: null, objectDrops: null,
    itemDrops: null, ...fields });
  const items = new Map([
    [100, item({ vendors: list(10, 12) })],
    [101, item({ vendors: list(10, 11), questRewards: list(50, 51) })],
    [102, item({ vendors: list(13, 14, 77), objectDrops: list(8) })],
    [103, item({})],
  ]);
  const sources = (itemIds) => recipeItemSources(new Map([["r", itemIds]]), { items, npcs, quests },
    (zone) => zones.get(zone), capitals);

  it("lists vendor zones per side and keeps a capital unless its own zone also sells it", () => {
    expect(sources([100]).byRecipe.get("r")).toEqual({ H: ["Orgrimmar"], A: ["Darnassus"] });
    expect(sources([101]).byRecipe.get("r")).toEqual({ H: ["Durotar"], A: ["Quest"], N: ["Quest"] });
  });

  it("puts hostile-to-both and unflagged vendors on the neutral side, falling back to the NPC's zone", () => {
    const result = sources([102]);
    expect(result.byRecipe.get("r")).toEqual({ N: ["Mulgore", "Tanaris"], drop: {} });
    expect([...result.unnamedZones]).toEqual([99]);
    expect([...result.unknownNpcs]).toEqual([77]);
  });

  it("merges every item of a recipe and leaves out recipes with no known source", () => {
    expect(sources([100, 103, 404]).byRecipe.get("r")).toEqual({ H: ["Orgrimmar"], A: ["Darnassus"] });
    expect(sources([103, 404]).byRecipe.has("r")).toBe(false);
  });
  describe("drops", () => {
    const points = (count) => list(...Array.from({ length: count }, () => list(0, 0)));
    const mob = (rank, spawnMap, fields = {}) => ({ name: `Mob ${rank}`, rank, spawns: { list: [], map: spawnMap },
      ...fields });
    const mobs = new Map([
      [20, mob(0, new Map([[2, points(1)], [4, points(3)]]), { name: "Common" })],
      [21, mob(4, new Map([[2, points(1)]]), { name: "Rare" })],
      [22, mob({ ref: "npcRanks.RARE" }, new Map(), { name: "Forever Rare" })],
      [23, mob(1, new Map([[99, points(5)]]), { name: "Unnamed Zone" })],
      [24, mob(0, null, { name: "Nowhere" })],
      ...[30, 31, 32, 33, 34, 35].map((id) => [id, mob(0, new Map([[1, points(1)]]), { name: `World ${id}` })]),
    ]);
    const dropSource = (npcDrops, chances) => recipeItemSources(new Map([["r", [200]]]), {
      items: new Map([[200, item({ npcDrops: list(...npcDrops) })]]), npcs: mobs, quests,
      dropChances: new Map([[200, new Map(chances)]]),
    }, (zone) => zones.get(zone), capitals);
    const drop = (npcDrops, chances) => dropSource(npcDrops, chances).byRecipe.get("r").drop;

    it("names the common mob with the best chance and its busiest zone, even over a likelier rare", () => {
      expect(drop([20, 21], [[20, 0.123], [21, 5]])).toEqual({ npc: "Common", zone: "Tanaris", chance: 0.12 });
    });

    it("falls back to rares, then to mobs with no known chance, ties going to the most spawns", () => {
      expect(drop([20, 21], [[21, 5]])).toEqual({ npc: "Rare", zone: "Durotar", chance: 5 });
      expect(drop([22, 24, 20], [])).toEqual({ npc: "Common", zone: "Tanaris" });
      expect(drop([24], [])).toEqual({ npc: "Nowhere" });
    });

    it("calls it a world drop when more than five mobs share the best chance", () => {
      const world = [30, 31, 32, 33, 34, 35];
      expect(drop(world, world.map((id) => [id, 0.02]))).toEqual({ world: true, chance: 0.02 });
      expect(drop(world.slice(1), world.map((id) => [id, 0.02])).npc).toBe("World 31");
    });

    it("leaves out unnamed zones, reporting them", () => {
      const result = dropSource([23], [[23, 1]]);
      expect(result.byRecipe.get("r").drop).toEqual({ npc: "Unnamed Zone", chance: 1 });
      expect([...result.unnamedZones]).toEqual([99]);
    });
  });
});

describe("locateItems and zoneNamesByCount", () => {
  const objects = new Map([
    [1, { name: "Copper Vein", zones: new Map([[1, 2], [2, 5]]) }],
    [2, { name: "Copper Vein", zones: new Map([[1, 4]]) }],
    [3, { name: "Mageroyal", zones: new Map([[3, 1]]) }],
    [4, { name: "Mageroyal", zones: new Map([[4, 9]]) }],
  ]);

  it("sums every object of a name, restricts rules by id and reports rules with no spawns", () => {
    const rules = [
      { node: "Copper Vein", items: [10, 11] },
      { ids: [3], items: [12] },
      { node: "Nothing", items: [13] },
    ];
    const { located, unmatched } = locateItems(objects, rules);
    expect(located.get(10)).toEqual(new Map([[1, 6], [2, 5]]));
    expect(located.get(11)).toEqual(located.get(10));
    expect(located.get(12)).toEqual(new Map([[3, 1]]));
    expect(located.has(13)).toBe(false);
    expect(unmatched).toEqual([rules[2]]);
  });

  it("orders zone names by spawn count, ties by name, and returns unnamed zones apart", () => {
    const names = new Map([[1, "Zeta"], [2, "Alpha"], [3, "Beta"]]);
    const zones = new Map([[1, 5], [2, 5], [3, 9], [4, 1]]);
    expect(zoneNamesByCount(zones, names)).toEqual({ names: ["Beta", "Alpha", "Zeta"], unnamed: [4] });
  });

  it("adds up zone ids that share a name", () => {
    const names = new Map([[1, "X"], [2, "X"], [3, "Y"]]);
    expect(zoneNamesByCount(new Map([[1, 10], [2, 10], [3, 15]]), names).names).toEqual(["X", "Y"]);
  });
});

describe("spellsTaughtByItems", () => {
  const effects = new Map([
    [1, { spell: 100, trigger: 6 }], // recipe item: teaches 100
    [2, { spell: 200, trigger: 0 }], // enchant scroll: casts 200, teaches nothing
    [3, { spell: 483, trigger: 0 }], // casts a learn spell that teaches 300
  ]);
  const learns = new Map([[483, [300]]]);

  it("counts learn triggers and learn spells, not items that only cast the recipe, each teaching item once", () => {
    const links = [{ effect: 1, item: 10 }, { effect: 2, item: 20 }, { effect: 3, item: 30 }, { effect: 1, item: 11 },
      { effect: 1, item: 10 }];
    expect(spellsTaughtByItems(effects, links, learns)).toEqual(new Map([[100, [10, 11]], [300, [30]]]));
  });

  it("ignores links to effects missing from the table", () => {
    expect(spellsTaughtByItems(effects, [{ effect: 404, item: 40 }], learns)).toEqual(new Map());
  });
});
