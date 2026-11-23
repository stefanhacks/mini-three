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

// Item.ClassID 7 (Trade Goods) subclasses, and the profession that collects each gatherable one.
export const TRADE_GOODS_CLASS = 7;
export const CLOTH_SUBCLASS = 5;
export const GATHER_SUBCLASS = { 9: "herbalism", 7: "mining", 6: "skinning" };
// Cloth is not collected by any profession: it gets its own pseudo-profession key.
export const CLOTH_KEY = "cloth";

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
// Otherwise gatherables are reagents that no recipe creates. Cloth (class 7, subclass 5) goes under CLOTH_KEY.
export const classifyGatherables = (items, recipes, allowLists = {}) => {
  const allowed = new Map();
  for (const [profession, ids] of Object.entries(allowLists)) {
    for (const id of ids) {
      allowed.set(id, profession);
    }
  }
  const created = new Set();
  for (const recipe of recipes) {
    if (recipe.item) {
      created.add(recipe.item);
    }
  }
  const found = {};
  const add = (profession, id) => {
    (found[profession] ??= new Set()).add(id);
  };
  for (const recipe of recipes) {
    for (const { item: id } of recipe.reagents) {
      const item = items.get(id);
      // The hand-written lists win: some gathered items can also be crafted (Light Leather from scraps).
      if (allowed.has(id)) {
        add(allowed.get(id), id);
        continue;
      }
      if (!item || created.has(id)) {
        continue;
      }
      if (item.classId === TRADE_GOODS_CLASS && item.subclassId === CLOTH_SUBCLASS) {
        add(CLOTH_KEY, id);
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
// `-- comments`, `[number]` and `[a.b]` keys, and bare dotted names as values (kept as { ref: "a.b" }).
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
  const readValue = () => {
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
  const rawStart = rawText.indexOf("[[return {");
  const rawEnd = rawText.lastIndexOf("}]]");
  if (rawStart === -1 || rawEnd === -1) {
    throw new Error("object table not found: expected [[return { ... }]]");
  }
  const raw = parseLua(rawText.slice(rawStart + "[[return ".length, rawEnd + 1));
  for (const [id, entry] of raw.map) {
    objects.set(id, { name: entry.list[0], zones: spawnCounts(entry.list[3]) });
  }
  const deltaStart = deltaText.indexOf("return {");
  const deltaEnd = deltaText.lastIndexOf("}");
  if (deltaStart === -1) {
    throw new Error("delta table not found: expected return { ... }");
  }
  const delta = parseLua(deltaText.slice(deltaStart + "return ".length, deltaEnd + 1));
  for (const [id, entry] of delta.map) {
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
          zones.set(zone, (zones.get(zone) ?? 0) + count);
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
      byName.set(name, (byName.get(name) ?? 0) + count);
    } else {
      unnamed.push(zone);
    }
  }
  const names = [...byName.entries()]
    .sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB))
    .map(([name]) => name);
  return { names, unnamed };
};
