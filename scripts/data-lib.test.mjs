import { describe, expect, it } from "vitest";
import {
  classifyGatherables, locateItems, parseCsv, parseCsvRows, parseLua, readQuestieObjects, spellsTaughtByItems,
  zoneNamesByCount,
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

  it("counts learn triggers and learn spells, not items that only cast the recipe", () => {
    const links = [{ effect: 1, item: 10 }, { effect: 2, item: 20 }, { effect: 3, item: 30 }];
    expect(spellsTaughtByItems(effects, links, learns)).toEqual(new Set([100, 300]));
  });

  it("ignores links to effects missing from the table", () => {
    expect(spellsTaughtByItems(effects, [{ effect: 404, item: 40 }], learns)).toEqual(new Set());
  });
});
