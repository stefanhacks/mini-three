// Facts that only a server knows, read from the CMaNGOS Classic world database (https://github.com/cmangos/classic-db,
// GPLv3): where fish are caught, what fishing pools yield, and the skill a trainer asks for each recipe.
// Pure helpers: the SQL dump comes in as text. Nothing from it is copied into this repo, only the facts derived here.
import { appendTo, keysByValueDesc } from "./data-lib.mjs";

// Column names of `CREATE TABLE \`table\`` in a mysqldump, in order.
const columnsOf = (sql, table) => {
  const start = sql.indexOf(`CREATE TABLE \`${table}\` (`);
  if (start === -1) {
    throw new Error(`table ${table} not found in the SQL dump`);
  }
  const end = sql.indexOf("\n)", start);
  return sql.slice(start, end).split("\n").slice(1)
    .map((line) => /^\s+`([^`]+)`/.exec(line)?.[1])
    .filter(Boolean);
};

/**
 * Rows of a table in a mysqldump: every `INSERT INTO \`table\` VALUES (...),(...);` statement, as objects keyed by
 * the column names of its CREATE TABLE. Quoted values are strings (backslash escapes kept as the escaped character),
 * NULL is null, anything else a number.
 */
export const readSqlTable = (sql, table) => {
  const columns = columnsOf(sql, table);
  const head = `INSERT INTO \`${table}\` VALUES `;
  const rows = [];
  let at = sql.indexOf(head);
  while (at !== -1) {
    let i = at + head.length;
    let row = null;
    let field = "";
    let quoted = false;
    let wasQuoted = false;
    const push = () => {
      row.push(wasQuoted ? field : field === "NULL" ? null : Number(field));
      field = "";
      wasQuoted = false;
    };
    for (; i < sql.length; i += 1) {
      const ch = sql[i];
      if (quoted) {
        if (ch === "\\") {
          i += 1;
          field += sql[i];
        } else if (ch === "'") {
          quoted = false;
        } else {
          field += ch;
        }
      } else if (ch === "'") {
        quoted = true;
        wasQuoted = true;
      } else if (ch === "(" && !row) {
        row = [];
      } else if (ch === "," && row) {
        push();
      } else if (ch === ")" && row) {
        push();
        rows.push(Object.fromEntries(columns.map((name, index) => [name, row[index]])));
        row = null;
      } else if (ch === ";" && !row) {
        break;
      } else if (row) {
        field += ch;
      }
    }
    at = sql.indexOf(head, i);
  }
  return rows;
};

const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    appendTo(map, row[key], row);
  }
  return map;
};

/**
 * Chance in percent of each item in one loot entry, following references. Rows use the mangos loot columns: `item`,
 * `ChanceOrQuestChance`, `groupid`, `mincountOrRef` (negative: a reference_loot_template entry, rolled with the row's
 * chance). In a group (groupid > 0) one item drops: rows with chance 0 share what the others leave equally. Rows in
 * group 0 with chance 0 never drop, and neither do quest-only rows (negative chance). Returns Map<item, chance>,
 * the best chance when an item shows up twice.
 */
export const lootChances = (rows, referencesById, scale = 1, depth = 0, out = new Map()) => {
  if (depth > 5) {
    return out;
  }
  const groups = groupBy(rows, "groupid");
  for (const [group, members] of groups) {
    const explicit = members.reduce((sum, row) => sum + Math.max(0, row.ChanceOrQuestChance), 0);
    const shared = members.filter((row) => row.ChanceOrQuestChance === 0).length;
    for (const row of members) {
      if (row.ChanceOrQuestChance < 0) {
        continue;
      }
      const chance = row.ChanceOrQuestChance > 0 ? row.ChanceOrQuestChance
        : group > 0 && shared > 0 ? Math.max(0, 100 - explicit) / shared : 0;
      if (chance <= 0) {
        continue;
      }
      if (row.mincountOrRef < 0) {
        lootChances(referencesById.get(-row.mincountOrRef) ?? [], referencesById, scale * chance / 100, depth + 1, out);
      } else {
        out.set(row.item, Math.max(out.get(row.item) ?? 0, scale * chance));
      }
    }
  }
  return out;
};

/**
 * Where each of `items` can be fished: Map<item, Map<areaId, chance>>. fishingRows: fishing_loot_template, whose
 * `entry` is an AreaTable id (zone or subzone; 0 is junk and skipped). referenceRows: reference_loot_template.
 */
export const fishingAreas = (fishingRows, referenceRows, items) => {
  const wanted = new Set(items);
  const references = groupBy(referenceRows, "entry");
  const found = new Map();
  for (const [area, rows] of groupBy(fishingRows, "entry")) {
    if (area === 0) {
      continue;
    }
    for (const [item, chance] of lootChances(rows, references)) {
      if (wanted.has(item)) {
        const areas = found.get(item) ?? new Map();
        areas.set(area, Math.max(areas.get(area) ?? 0, chance));
        found.set(item, areas);
      }
    }
  }
  return found;
};

/**
 * Chance in percent that each creature drops each of `items`: Map<item, Map<creature, chance>>. templateRows:
 * creature_template (`Entry`, `LootId`, 0 for no loot), lootRows: creature_loot_template, referenceRows:
 * reference_loot_template. Creatures sharing a loot entry share its chances.
 */
export const creatureDropChances = (templateRows, lootRows, referenceRows, items) => {
  const wanted = new Set(items);
  const loot = groupBy(lootRows, "entry");
  const references = groupBy(referenceRows, "entry");
  const byLootId = new Map();
  const found = new Map();
  for (const creature of templateRows.filter((row) => row.LootId > 0)) {
    if (!byLootId.has(creature.LootId)) {
      const chances = lootChances(loot.get(creature.LootId) ?? [], references);
      byLootId.set(creature.LootId, [...chances].filter(([item]) => wanted.has(item)));
    }
    for (const [item, chance] of byLootId.get(creature.LootId)) {
      const creatures = found.get(item) ?? new Map();
      creatures.set(creature.Entry, chance);
      found.set(item, creatures);
    }
  }
  return found;
};

// gameobject_template.type of fishing pools (GAMEOBJECT_TYPE_FISHINGHOLE); `data1` is their loot entry.
export const FISHING_POOL_TYPE = 25;

/**
 * Items each fishing pool yields, limited to `items`: Map<objectId, item[]>. templateRows: gameobject_template,
 * lootRows: gameobject_loot_template, referenceRows: reference_loot_template.
 */
export const poolYields = (templateRows, lootRows, referenceRows, items) => {
  const wanted = new Set(items);
  const loot = groupBy(lootRows, "entry");
  const references = groupBy(referenceRows, "entry");
  const yields = new Map();
  for (const pool of templateRows.filter((row) => row.type === FISHING_POOL_TYPE)) {
    const caught = [...lootChances(loot.get(pool.data1) ?? [], references).keys()].filter((item) => wanted.has(item));
    if (caught.length > 0) {
      yields.set(pool.entry, caught.sort((a, b) => a - b));
    }
  }
  return yields;
};

/**
 * The lowest skill any trainer asks before teaching each spell: Map<spell, skill>. trainerRows: npc_trainer and
 * npc_trainer_template rows (`spell`, `reqskill`, `reqskillvalue`). Their `spell` is usually a teaching spell, so
 * `learns` (Map<spell, spell[]>, from learn-spell effects) maps it to the spells it teaches. Only rows asking for one
 * of `skillLines` count. A value below 1 counts as 1.
 */
export const trainerSkillLevels = (trainerRows, learns, skillLines) => {
  const levels = new Map();
  for (const row of trainerRows.filter((entry) => skillLines.has(entry.reqskill))) {
    const level = Math.max(1, row.reqskillvalue);
    for (const spell of [row.spell, ...(learns.get(row.spell) ?? [])]) {
      levels.set(spell, Math.min(levels.get(spell) ?? Infinity, level));
    }
  }
  return levels;
};

/**
 * A fish's zone names, most likely first: zones it is fished in by best chance (ties by name), then zones where only
 * one of its pools spawns, by spawn count (ties by name). chances: Map<name, percent>, poolSpawns: Map<name, count>.
 */
export const orderFishZones = (chances, poolSpawns) => [
  ...keysByValueDesc(chances),
  ...keysByValueDesc([...poolSpawns].filter(([name]) => !chances.has(name))),
];
