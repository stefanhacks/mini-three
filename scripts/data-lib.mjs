// Pure helpers for the data pipeline: CSV parsing and classification.

// Parses RFC 4180 style CSV text into rows of cells: quoted fields, "" escapes and newlines inside quotes.
export const parseCsvRows = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch !== "\"") {
        field += ch;
      } else if (text[i + 1] === "\"") {
        field += "\"";
        i += 1;
      } else {
        quoted = false;
      }
    } else if (ch === "\"") {
      quoted = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") {
        i += 1;
      }
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    pushRow();
  }
  return rows;
};

// Parses CSV text into an array of objects keyed by the header row. Blank lines are skipped.
export const parseCsv = (text) => {
  const [header, ...rows] = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (!header) {
    return [];
  }
  return rows
    .filter((cells) => !(cells.length === 1 && cells[0] === ""))
    .map((cells) => {
      const record = {};
      header.forEach((name, index) => {
        record[name] = cells[index] ?? "";
      });
      return record;
    });
};

export const toInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
};

// Appends `value` to the list under `key`, creating it on first use.
export const appendTo = (map, key, value) => {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
};

// Adds `amount` to the number under `key` (0 when absent).
export const addTo = (map, key, amount) => map.set(key, (map.get(key) ?? 0) + amount);

// The keys of [key, value] pairs, highest value first, ties by key (names: localeCompare).
export const keysByValueDesc = (entries) => [...entries]
  .sort(([nameA, valueA], [nameB, valueB]) => valueB - valueA || nameA.localeCompare(nameB))
  .map(([name]) => name);

// Item.ClassID 7 (Trade Goods) subclass 9 is herbs, the only gatherable kind the item tables can tell apart.
export const TRADE_GOODS_CLASS = 7;
export const GATHER_SUBCLASS = { 9: "herbalism" };

// Returns the gathering profession key for an item, or null when its class and subclass don't mark one.
export const gatherProfession = (item) => {
  if (item.classId !== TRADE_GOODS_CLASS) {
    return null;
  }
  return GATHER_SUBCLASS[item.subclassId] ?? null;
};

// Builds the gatherable item ids per profession key, sorted ascending.
// items: Map of item id to { classId, subclassId }.
// allowLists: { <profession key>: [item id] }, hand-written ids assigned to a profession whatever their class,
// even when a recipe also creates them.
// recipes: [{ profession, item?, reagents: [{ item }] }].
// Otherwise gatherables are reagents that no recipe creates and that the item class marks as gathered.
export const classifyGatherables = (items, recipes, allowLists = {}) => {
  const allowed = new Map();
  for (const [profession, ids] of Object.entries(allowLists)) {
    for (const id of ids) {
      allowed.set(id, profession);
    }
  }
  const created = new Set(recipes.filter((recipe) => recipe.item).map((recipe) => recipe.item));
  const found = {};
  const add = (profession, id) => {
    (found[profession] ??= new Set()).add(id);
  };
  for (const recipe of recipes) {
    for (const { item: id } of recipe.reagents) {
      const item = items.get(id);
      // The hand-written lists win: some gathered items can also be crafted.
      if (allowed.has(id)) {
        add(allowed.get(id), id);
        continue;
      }
      if (!item || created.has(id)) {
        continue;
      }
      const gatherer = gatherProfession(item);
      if (gatherer) {
        add(gatherer, id);
      }
    }
  }
  const result = {};
  for (const [profession, ids] of Object.entries(found)) {
    result[profession] = [...ids].sort((a, b) => a - b);
  }
  return result;
};

// Parses the subset of Lua that QuestieDB's entity tables use: tables, strings, numbers, nil, booleans,
// `-- comments`, `[number]` and `[a.b]` keys, bare dotted names as values (kept as { ref: "a.b" }) and sums of them.
// A table becomes { list, map }: positional values in order (nil stays null) and keyed values by key.
// Number keys are numbers, dotted-name keys are strings. Throws on anything else, with the offset.
export const parseLua = (text) => {
  let pos = 0;
  const fail = (message) => {
    throw new Error(`Lua parse error at ${pos}: ${message} near ${JSON.stringify(text.slice(pos, pos + 30))}`);
  };
  const skip = () => {
    for (;;) {
      while (pos < text.length && /\s/.test(text[pos])) {
        pos += 1;
      }
      const block = /^--\[(=*)\[/.exec(text.slice(pos, pos + 16));
      if (block) {
        // Block comment --[[ ... ]] or --[==[ ... ]==]: skip to the matching close.
        const close = `]${block[1]}]`;
        const end = text.indexOf(close, pos + block[0].length);
        pos = end === -1 ? text.length : end + close.length;
      } else if (text.startsWith("--", pos)) {
        const end = text.indexOf("\n", pos);
        pos = end === -1 ? text.length : end;
      } else {
        return;
      }
    }
  };
  const readName = () => {
    const match = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(text.slice(pos, pos + 80));
    if (!match) {
      fail("expected a name");
    }
    pos += match[0].length;
    return match[0];
  };
  const readString = () => {
    const quote = text[pos];
    let out = "";
    pos += 1;
    while (pos < text.length && text[pos] !== quote) {
      if (text[pos] === "\\") {
        pos += 1;
        const escapes = { n: "\n", t: "\t" };
        out += escapes[text[pos]] ?? text[pos];
      } else {
        out += text[pos];
      }
      pos += 1;
    }
    if (pos >= text.length) {
      fail("unterminated string");
    }
    pos += 1;
    return out;
  };
  // A value, or a sum of values (`raceIDs.ORC + raceIDs.TROLL`), kept as { sum: [values] } and not evaluated.
  const readValue = () => {
    const first = readTerm();
    skip();
    if (text[pos] !== "+") {
      return first;
    }
    const sum = [first];
    while (text[pos] === "+") {
      pos += 1;
      sum.push(readTerm());
      skip();
    }
    return { sum };
  };
  const readTerm = () => {
    skip();
    const ch = text[pos];
    if (ch === "{") {
      return readTable();
    }
    if (ch === "\"" || ch === "'") {
      return readString();
    }
    const number = /^-?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(text.slice(pos, pos + 40));
    if (number) {
      pos += number[0].length;
      return Number(number[0]);
    }
    const name = readName();
    const literals = { nil: null, true: true, false: false };
    return name in literals ? literals[name] : { ref: name };
  };
  const readTable = () => {
    const table = { list: [], map: new Map() };
    pos += 1;
    for (;;) {
      skip();
      if (text[pos] === "}") {
        pos += 1;
        return table;
      }
      if (text[pos] === "[") {
        pos += 1;
        skip();
        const key = /[0-9-]/.test(text[pos]) ? readValue() : readName();
        skip();
        if (text[pos] !== "]") {
          fail("expected ]");
        }
        pos += 1;
        skip();
        if (text[pos] !== "=") {
          fail("expected =");
        }
        pos += 1;
        table.map.set(key, readValue());
      } else {
        table.list.push(readValue());
      }
      skip();
      if (text[pos] === "," || text[pos] === ";") {
        pos += 1;
      } else if (text[pos] !== "}") {
        fail("expected , or }");
      }
    }
  };
  skip();
  const value = readValue();
  skip();
  if (pos < text.length) {
    fail("trailing text");
  }
  return value;
};

// The table of a QuestieDB data file (`QuestieDB.<kind>Data = [[return { [id] = {...} }]]`), parsed.
const parseQuestieRaw = (rawText, kind) => {
  const rawStart = rawText.indexOf("[[return {");
  const rawEnd = rawText.lastIndexOf("}]]");
  if (rawStart === -1 || rawEnd === -1) {
    throw new Error(`${kind} table not found: expected [[return { ... }]]`);
  }
  return parseLua(rawText.slice(rawStart + "[[return ".length, rawEnd + 1));
};

// The table of a QuestieDB Forever delta file (`function X:Load() ... return { [id] = {...} } end`), parsed.
const parseQuestieDelta = (deltaText) => {
  const deltaStart = deltaText.indexOf("return {");
  const deltaEnd = deltaText.lastIndexOf("}");
  if (deltaStart === -1) {
    throw new Error("delta table not found: expected return { ... }");
  }
  return parseLua(deltaText.slice(deltaStart + "return ".length, deltaEnd + 1));
};

/**
 * Reads a QuestieDB Forever entity table (items, NPCs, quests) with its delta into Map<id, { [field]: value }>.
 * `fields` names the raw table's positional fields in order; only these are kept. The delta's
 * `[<kind>Keys.<field>]` entries replace a field and `[<kind>Keys.<field>_add]` entries append to its list.
 * Values stay as parseLua gives them (tables as { list, map }).
 */
export const readQuestieTable = (rawText, deltaText, kind, fields) => {
  const entities = new Map();
  for (const [id, entry] of parseQuestieRaw(rawText, kind).map) {
    entities.set(id, Object.fromEntries(fields.map((field, i) => [field, entry.list[i] ?? null])));
  }
  for (const [id, entry] of parseQuestieDelta(deltaText).map) {
    const merged = entities.get(id) ?? Object.fromEntries(fields.map((field) => [field, null]));
    for (const field of fields) {
      const key = `${kind}Keys.${field}`;
      if (entry.map.has(key)) {
        merged[field] = entry.map.get(key);
      }
      const added = entry.map.get(`${key}_add`);
      if (added) {
        merged[field] = { list: [...(merged[field]?.list ?? []), ...added.list], map: merged[field]?.map ?? new Map() };
      }
    }
    entities.set(id, merged);
  }
  return entities;
};

// Reads QuestieDB's Forever object tables into Map<objectId, { name, zones: Map<zoneId, spawnCount> }>.
// rawText: data/Forever/foreverObjectDB.lua (a `[[return { [id] = {name, questStarts, questEnds, spawns, zone} }]]`
// string, spawns being the 4th positional field). deltaText: src/corrections/Forever/generated/foreverBaseObject.lua,
// whose entries override the raw ones with `[objectKeys.name]` and `[objectKeys.spawns]` keys.
// Only the name and the number of spawn points per zone are kept: coordinates are dropped here on purpose.
export const readQuestieObjects = (rawText, deltaText) => {
  const spawnCounts = (spawns) => {
    const zones = new Map();
    if (spawns && typeof spawns === "object") {
      for (const [zone, points] of spawns.map) {
        zones.set(zone, points.list.length);
      }
    }
    return zones;
  };
  const objects = new Map();
  for (const [id, entry] of parseQuestieRaw(rawText, "object").map) {
    objects.set(id, { name: entry.list[0], zones: spawnCounts(entry.list[3]) });
  }
  for (const [id, entry] of parseQuestieDelta(deltaText).map) {
    const merged = objects.get(id) ?? { name: undefined, zones: new Map() };
    if (entry.map.has("objectKeys.name")) {
      merged.name = entry.map.get("objectKeys.name");
    }
    if (entry.map.has("objectKeys.spawns")) {
      merged.zones = spawnCounts(entry.map.get("objectKeys.spawns"));
    }
    objects.set(id, merged);
  }
  return objects;
};

// Sums spawn counts per item and zone. objects: the Map from readQuestieObjects.
// rules: [{ node: "<object name>" } or { ids: [<object id>] }, items: [<item id>]]: every object matching the rule
// (all objects with that exact name, or just those ids) yields every listed item.
// Returns Map<itemId, Map<zoneId, spawnCount>> and the rules that matched no object with spawns.
export const locateItems = (objects, rules) => {
  const located = new Map();
  const unmatched = [];
  for (const rule of rules) {
    const matches = [...objects.entries()].filter(([id, object]) => object.zones.size > 0
      && (rule.ids ? rule.ids.includes(id) : object.name === rule.node));
    if (matches.length === 0) {
      unmatched.push(rule);
    }
    for (const item of rule.items) {
      const zones = located.get(item) ?? new Map();
      for (const [, object] of matches) {
        for (const [zone, count] of object.zones) {
          addTo(zones, zone, count);
        }
      }
      if (zones.size > 0) {
        located.set(item, zones);
      }
    }
  }
  return { located, unmatched };
};

// Turns { zoneId: count } into zone names, most spawns first (ties by name). Zone ids that share a name count
// together. Zones without a name are returned apart.
export const zoneNamesByCount = (zones, nameById) => {
  const byName = new Map();
  const unnamed = [];
  for (const [zone, count] of zones) {
    const name = nameById.get(zone);
    if (name) {
      addTo(byName, name, count);
    } else {
      unnamed.push(zone);
    }
  }
  return { names: keysByValueDesc(byName), unnamed };
};

// ItemEffect.TriggerType 6: using the item teaches its spell (recipe items). Type 0 casts it (enchant scrolls).
export const TRIGGER_LEARN = 6;
// SpellEffect.Effect 36: the spell teaches EffectTriggerSpell (the older "Learning" spell some items use).
export const SPELL_EFFECT_LEARN_SPELL = 36;

// The items that teach each spell: Map<spell id, item id[]>. An item teaches a spell when one of its effects has
// trigger type 6 for it, or casts a spell with a learn effect for it.
// effects: Map of ItemEffect id to { spell, trigger }. links: [{ effect, item }] (ItemXItemEffect).
// learns: Map of spell id to the spell ids its learn effects teach.
export const spellsTaughtByItems = (effects, links, learns) => {
  const taught = new Map();
  const add = (spell, item) => {
    const items = taught.get(spell) ?? [];
    if (!items.includes(item)) {
      taught.set(spell, [...items, item]);
    }
  };
  for (const { effect, item } of links) {
    const row = effects.get(effect);
    if (!row) {
      continue;
    }
    if (row.trigger === TRIGGER_LEARN) {
      add(row.spell, item);
    }
    for (const spell of learns.get(row.spell) ?? []) {
      add(spell, item);
    }
  }
  return taught;
};

// The fields read from QuestieDB's Forever item, NPC and quest tables, by position (see each file's `<kind>Keys`).
export const QUESTIE_ITEM_FIELDS = [
  "name", "npcDrops", "objectDrops", "itemDrops", "startQuest", "questRewards", "flags", "foodType", "itemLevel",
  "requiredLevel", "ammoType", "class", "subClass", "vendors",
];
export const QUESTIE_NPC_FIELDS = [
  "name", "minLevelHealth", "maxLevelHealth", "minLevel", "maxLevel", "rank", "spawns", "waypoints", "zoneID",
  "questStarts", "questEnds", "factionID", "friendlyToFaction",
];
export const QUESTIE_QUEST_FIELDS = ["name", "startedBy"];

export const RECIPE_SIDES = ["H", "A", "N"];
export const QUEST_PLACE = "Quest";

/**
 * Where each recipe's items are obtained, from QuestieDB: per side (H Horde, A Alliance, N neutral, by the NPC's
 * `friendlyToFaction`), the zone names their vendors spawn in, sorted, then "Quest" when a quest of that side rewards
 * one; and `drop` when a creature, object or container drops one. A quest's side is its starting NPCs' side (neutral
 * when no NPC starts it). A capital listed with its own zone is left out: the zone wins (`capitals` maps a capital's
 * name to its zone's). itemsByRecipe: Map<recipe key, recipe item ids>. data: { items, npcs, quests } from
 * readQuestieTable. zoneName(id): the zone's name, or undefined. Returns { byRecipe: Map<recipe key,
 * { H?, A?, N?, drop? }> (recipes with no known source left out), unnamedZones: Set<zoneId>,
 * unknownNpcs: Set<npcId> }.
 */
export const recipeItemSources = (itemsByRecipe, { items, npcs, quests }, zoneName, capitals) => {
  const ids = (table) => (table?.list ?? []).filter((value) => typeof value === "number");
  const sideOf = (npc) => (["H", "A"].includes(npc.friendlyToFaction) ? npc.friendlyToFaction : "N");
  const drops = (item) => [item.npcDrops, item.objectDrops, item.itemDrops].some((table) => ids(table).length > 0);
  const unnamedZones = new Set();
  const unknownNpcs = new Set();
  const zonesOf = (npc) => {
    const spawned = [...(npc.spawns?.map?.keys() ?? [])].filter((zone) => typeof zone === "number");
    return spawned.length > 0 ? spawned : [npc.zoneID].filter((zone) => typeof zone === "number" && zone > 0);
  };
  const byRecipe = new Map();
  for (const [key, itemIds] of itemsByRecipe) {
    const zones = Object.fromEntries(RECIPE_SIDES.map((side) => [side, new Set()]));
    const questSides = new Set();
    const found = itemIds.map((id) => items.get(id)).filter(Boolean);
    for (const item of found) {
      for (const vendor of ids(item.vendors)) {
        const npc = npcs.get(vendor);
        if (!npc) {
          unknownNpcs.add(vendor);
          continue;
        }
        for (const zone of zonesOf(npc)) {
          const name = zoneName(zone);
          if (name) {
            zones[sideOf(npc)].add(name);
          } else {
            unnamedZones.add(zone);
          }
        }
      }
      for (const questId of ids(item.questRewards)) {
        const starters = ids(quests.get(questId)?.startedBy?.list[0]).map((id) => npcs.get(id)).filter(Boolean);
        (starters.length > 0 ? starters.map(sideOf) : ["N"]).forEach((side) => questSides.add(side));
      }
    }
    const source = {};
    for (const side of RECIPE_SIDES) {
      const places = [...zones[side]]
        .filter((zone) => !zones[side].has(capitals.get(zone)))
        .sort((a, b) => a.localeCompare(b));
      if (questSides.has(side)) {
        places.push(QUEST_PLACE);
      }
      if (places.length > 0) {
        source[side] = places;
      }
    }
    if (found.some(drops)) {
      source.drop = true;
    }
    if (Object.keys(source).length > 0) {
      byRecipe.set(key, source);
    }
  }
  return { byRecipe, unnamedZones, unknownNpcs };
};
