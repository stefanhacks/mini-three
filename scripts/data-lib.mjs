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
// allowLists: { <profession key>: [item id] }, hand-written ids assigned to a profession whatever their class.
// recipes: [{ profession, item?, reagents: [{ item }] }].
// Gatherables are reagents that no recipe creates. Cloth (class 7, subclass 5) goes under CLOTH_KEY.
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
      if (!item || created.has(id)) {
        continue;
      }
      if (allowed.has(id)) {
        add(allowed.get(id), id);
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
