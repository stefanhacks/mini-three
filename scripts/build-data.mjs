// Builds src/data/*.json from the WoW: Forever client DB2 tables (wago.tools, product wowf).
// Run with `npm run data`. Downloads are cached in .cache/; the output JSON is committed.
import { Buffer } from "node:buffer";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { gunzipSync } from "node:zlib";
import { resolveDescription } from "./descriptions.mjs";
import {
  QUESTIE_ITEM_FIELDS, QUESTIE_NPC_FIELDS, QUESTIE_QUEST_FIELDS, SPELL_EFFECT_LEARN_SPELL, addTo, appendTo,
  classifyGatherables, locateItems, parseCsv, readQuestieObjects, readQuestieTable, recipeItemSources,
  spellsTaughtByItems, toInt, zoneNamesByCount,
} from "./data-lib.mjs";
import {
  fishingAreas, orderFishZones, poolYields, readSqlTable, trainerSkillLevels,
} from "./server-data.mjs";

// Pinned inputs: change them on purpose, and the output changes with them.
// Tables are fetched with useHotfixes=true. It is an undocumented wago.tools query parameter (found by trying it):
// without it ItemSparse lacks ~6,000 live items, so names and qualities go missing.
const BUILD = "1.60.1.71037";
const LISTFILE_TAG = "202611211242";
// Known locations come from QuestieDB (https://github.com/Questie/QuestieDB, GPLv3), Forever branch, at this commit.
// This repo is public domain, so only derived facts are kept: the zone names where each node type spawns.
// None of QuestieDB's files, code or coordinates are copied here: the Lua is read at build time, cached in .cache/,
// and reduced to a spawn count per zone. Source files: data/Forever/foreverObjectDB.lua (the object table, fields
// name, questStarts, questEnds, spawns = { [AreaTable id] = { { x, y }, ... } }, zone) plus the Forever delta
// src/corrections/Forever/generated/foreverBaseObject.lua (adds objects such as the Forever-only herb nodes).
// Recipe sources are read the same way from the item, NPC and quest tables and their deltas (which add the
// Forever-only recipe items and vendors), and reduced to each recipe's vendor zone names, sides, and whether a quest
// rewards it or something drops it.
const QUESTIE_COMMIT = "9921e9bfe86a600e83b157fc3f25e578f7725216";
const QUESTIE_OBJECT_FILES = [
  "data/Forever/foreverObjectDB.lua",
  "src/corrections/Forever/generated/foreverBaseObject.lua",
];
const QUESTIE_SOURCE_FILES = {
  item: ["data/Forever/foreverItemDB.lua", "src/corrections/Forever/generated/foreverBaseItem.lua"],
  npc: ["data/Forever/foreverNpcDB.lua", "src/corrections/Forever/generated/foreverBaseNpc.lua"],
  quest: ["data/Forever/foreverQuestDB.lua", "src/corrections/Forever/generated/foreverBaseQuest.lua"],
};
// Capitals (AreaTable names, as QuestieDB places their NPCs) and the zone around each. A recipe sold both in a capital
// and elsewhere in its zone lists only the zone.
const CAPITAL_ZONES = new Map([
  ["Orgrimmar", "Durotar"],
  ["Thunder Bluff", "Mulgore"],
  ["Undercity", "Tirisfal Glades"],
  ["Stormwind City", "Elwynn Forest"],
  ["Ironforge", "Dun Morogh"],
  ["Darnassus", "Teldrassil"],
]);
// Server-side facts come from the CMaNGOS Classic world database (https://github.com/cmangos/classic-db, GPLv3), at
// this commit, read the same way as QuestieDB: the gzipped dump is cached in .cache/ and reduced at build time to
// zone names per fish, the fish each pool yields and a skill level per recipe. Nothing else is kept. The repo's
// Updates/*.sql are not applied: at this commit none of them changes fishing loot, pool loot or trainers (check again
// when bumping the commit).
const CLASSICDB_COMMIT = "13e933726f386399d9820138fbd1123e7cda86c8";
const CLASSICDB_FILE = "Full_DB/ClassicDB_1_12_1_z2815.sql.gz";
// The trainer rows name teaching spells that the Forever client mostly dropped. The Classic Era client still has
// them: its learn-spell effects say which recipe each teaching spell teaches. Only SpellEffect is read from it.
const ERA_BUILD = "1.15.9.70576";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache");
const OUT_DIR = path.join(ROOT, "src", "data");

// The professions the app covers, in tab order. Nothing else is read from the client tables. `tier` sets the two
// primary professions apart from the three secondary ones. Matched by name among top-level SkillLines.
const PROFESSIONS = [
  { key: "alchemy", name: "Alchemy", tier: "primary" },
  { key: "herbalism", name: "Herbalism", tier: "primary" },
  { key: "cooking", name: "Cooking", tier: "secondary" },
  { key: "fishing", name: "Fishing", tier: "secondary" },
  { key: "first-aid", name: "First Aid", tier: "secondary" },
];
// SkillLine.CategoryID: 11 is a main profession, 9 a secondary one (the others are weapons, languages, riding...).
const PROFESSION_CATEGORIES = new Set([9, 11]);

const TABLES = [
  "SkillLine", "SkillLineAbility", "TradeSkillCategory", "SpellName", "SpellReagents", "SpellEffect",
  "Item", "ItemSparse", "ItemModifiedAppearance", "ItemAppearance", "ItemEffect", "ItemXItemEffect",
  "Spell", "SpellMisc", "SpellDuration", "SpellRadius", "SpellAuraOptions", "AreaTable",
];

const SPELL_EFFECT_CREATE_ITEM = 24;
// The game doesn't support skill above this yet: recipes learnable only above it are left out.
const MAX_LEARN_SKILL = 300;
// Learnable levels no data source has (Forever-only trainer recipes, Classic quest and event recipes), read by hand
// from each recipe's Wowhead page (wowhead.com/forever, the "Skill" column) and checked by the owner. Keyed by
// `<profession>:<spell>`. The build fails when an entry names no recipe, or when a recipe item or trainer starts giving
// that recipe a level: then the entry can go. Unknown on Wowhead too, left out: Cleansing Stew, Refined Scale of
// Onyxia, Crystal Infused Bandage.
const LEARN_BY_HAND = {
  "herbalism:1229705": 20, // Incense Candle
  "fishing:1229745": 20, // Fish Bowl
  "first-aid:1230117": 20, // First Aid Kit
  "first-aid:1244431": 1, // Minor Healing Potion
  "first-aid:1244432": 85, // Lesser Healing Potion
  "first-aid:1244433": 110, // Healing Potion
  "alchemy:1244645": 85, // Lesser Discolored Healing Potion
  "alchemy:1244646": 135, // Discolored Healing Potion
  "alchemy:1244647": 175, // Greater Discolored Healing Potion
  "alchemy:1244648": 230, // Superior Discolored Healing Potion
  "cooking:1247741": 210, // Spinefin Halibut
  "alchemy:1249630": 40, // Cerulean Dye
  "alchemy:1249631": 120, // Magenta Dye
  "alchemy:1249632": 215, // Viridian Dye
  "alchemy:1230564": 20, // Mana Well
  "alchemy:1249633": 40, // Sulfuric Acid
  "first-aid:1259342": 90, // Simple Poultice
  "first-aid:1259347": 120, // Woolen Tourniquet
  "alchemy:1250775": 205, // Revealing Draught
  "cooking:1270632": 80, // Critter Cookie
  "alchemy:2329": 15, // Elixir of Minor Strength
  "alchemy:2365": 100, // Draught of Tongues
  "alchemy:11452": 225, // Restorative Potion
  "alchemy:24266": 315, // Gurubashi Mojo Madness (above 300: dropped)
  "cooking:24801": 325, // Smoked Desert Dumplings (above 300: dropped)
};
// SkillLineAbility.AcquireMethod 1: the recipe comes with the profession, so it is learnable at skill 1.
const ACQUIRE_WITH_PROFESSION = 1;
// ItemEffect.TriggerType 0: the item's "Use:" spell.
const TRIGGER_USE = 0;
// Description tokens that point at data the client doesn't have, rewritten before resolving. Each `from` must still be
// in that spell's description: the build fails when a new client build fixes the data, so the patch can go.
const DESCRIPTION_PATCHES = [
  // Goldthorn Tea: the buff 1249907 has a single effect (+15 Herbalism, index 0), not a second one.
  { spell: 1249906, from: "$1249907s2", to: "$1249907s1" },
];
const MAX_REAGENTS = 8;
const FISH_PET_FOOD = 2;

// Recipes in these TradeSkillCategory names are dropped (matched by name, case-insensitive).
const EXCLUDED_CATEGORIES = ["SEASON OF DISCOVERY"];

// Hand-written gatherables, because the item tables cannot tell them apart. Ids must be reagents in the data.
// Fish caught with a fishing pole in Classic. Crab, clam and crawler meat share pet food type fish but are not fished.
const FISHING_ITEMS = [
  4603, // Raw Spotted Yellowtail
  6289, // Raw Longjaw Mud Snapper
  6291, // Raw Brilliant Smallfish
  6303, // Raw Slitherskin Mackerel
  6308, // Raw Bristle Whisker Catfish
  6317, // Raw Loch Frenzy
  6361, // Raw Rainbow Fin Albacore
  6358, // Oily Blackmouth
  6359, // Firefin Snapper
  6362, // Raw Rockscale Cod
  8365, // Raw Mithril Head Trout
  8959, // Raw Spinefin Halibut
  13422, // Stonescale Eel
  13754, // Raw Glossy Mightfish
  13756, // Raw Summer Bass
  13758, // Raw Redgill
  13759, // Raw Nightfin Snapper
  13760, // Raw Sunscale Salmon
  13888, // Darkclaw Lobster
  13889, // Raw Whitescale Salmon
  21071, // Raw Sagefish
  21153, // Raw Greater Sagefish
  // Used by Cooking but missing from the first list. All four turn up in the CMaNGOS fishing loot or pools; the
  // report's "pet food type fish" checklist is how to spot fish that are still missing.
  6522, // Deviate Fish
  13755, // Raw Winter Squid
  13890, // Raw Plated Armorfish
  13893, // Large Raw Mightfish
];
// Herb-bag items that Herbalism gathers but are not class 7 subclass 9 (seeds are class 15, Morrowgrain class 12).
const HERBALISM_ITEMS = [
  5173, // Deathweed
  11040, // Morrowgrain
  17034, // Maple Seed
  17035, // Stranglethorn Seed
];
// Which item each Herbalism node yields, hand-checked. A rule matches objects by exact name (`node`: the
// same node has several object ids, one per spawn group or zone) or by object id (`ids`, when only some objects of a
// name yield it). Yields follow QuestieDB's item `objectDrops` (the loot tables), limited to these node objects:
// chests and crates that also hold the same items are not nodes.
const LOCATION_RULES = [
  // Herbs: each node yields the herb of the same name.
  { node: "Silverleaf", items: [765] }, // Silverleaf
  { node: "Mageroyal", items: [785] }, // Mageroyal
  { node: "Peacebloom", items: [2447] }, // Peacebloom
  { node: "Earthroot", items: [2449] }, // Earthroot
  { node: "Briarthorn", items: [2450] }, // Briarthorn
  { node: "Bruiseweed", items: [2453] }, // Bruiseweed
  { node: "Wild Steelbloom", items: [3355] }, // Wild Steelbloom
  { node: "Kingsblood", items: [3356] }, // Kingsblood
  { node: "Liferoot", items: [3357] }, // Liferoot
  { node: "Khadgar's Whisker", items: [3358] }, // Khadgar's Whisker
  { node: "Grave Moss", items: [3369] }, // Grave Moss
  { node: "Fadeleaf", items: [3818] }, // Fadeleaf
  { node: "Wintersbite", items: [3819] }, // Wintersbite
  { node: "Stranglekelp", items: [3820] }, // Stranglekelp
  { node: "Goldthorn", items: [3821] }, // Goldthorn
  { node: "Firebloom", items: [4625] }, // Firebloom
  { node: "Purple Lotus", items: [8831] }, // Purple Lotus
  { node: "Arthas' Tears", items: [8836] }, // Arthas' Tears
  { node: "Sungrass", items: [8838] }, // Sungrass
  { node: "Blindweed", items: [8839] }, // Blindweed
  { node: "Ghost Mushroom", items: [8845] }, // Ghost Mushroom
  { node: "Gromsblood", items: [8846] }, // Gromsblood
  { node: "Dreamfoil", items: [13463] }, // Dreamfoil
  { node: "Golden Sansam", items: [13464] }, // Golden Sansam
  { node: "Mountain Silversage", items: [13465] }, // Mountain Silversage
  { node: "Plaguebloom", items: [13466] }, // Plaguebloom
  { node: "Icecap", items: [13467] }, // Icecap
  { node: "Black Lotus", items: [13468] }, // Black Lotus
  { node: "Demonsage", items: [248821] }, // Demonsage (Forever-only node, same name)
  { node: "Marefoil", items: [248823] }, // Marefoil (Forever-only node, same name)
  // Herbs gathered from another herb's node, by the object ids QuestieDB lists as their drop sources.
  { ids: [1620, 1621], items: [2452] }, // Swiftthistle: Mageroyal and Briarthorn nodes (Questie ids 1620, 1621)
  { ids: [142140], items: [8153] }, // Wildvine: Purple Lotus node (Questie id 142140)
  // Bloodvine: the Zul'Gurub Sungrass, Purple Lotus, Silversage, Sansam and Dreamfoil nodes
  { ids: [180164, 180165, 180166, 180167, 180168], items: [19726] },
  // Not mapped on purpose: Deathweed, Morrowgrain, the seeds, Death Lotus, Frilled Lichen, Rosecap and Stranglevine (no
  // node known).
];
// Locations are kept only for these professions: the UI shows a "Found in" line for herbs.
const LOCATION_PROFESSIONS = ["herbalism"];

// ItemSparse.BagFamily bits that name the profession bag an item belongs in.
const BAG_FAMILY_CHECKS = [
  { bit: 32, label: "herb bag", profession: "herbalism" },
];

const log = (...args) => console.log(...args);

const fetchOk = async (url) => {
  const response = await fetch(url).catch((error) => {
    // Node's fetch ignores HTTPS_PROXY unless asked (Node 22.21 or newer): the usual cause in a sandbox.
    throw new Error(`${url} could not be reached (${error.cause?.code ?? error.message}). Behind a proxy, run with `
      + "NODE_USE_ENV_PROXY=1, see docs/DATA.md");
  });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response;
};

const exists = (file) => readFile(file).then(() => true, () => false);

// Downloads `file` into the cache unless it is there: `write(partial)` writes it to a temporary path, renamed once
// complete, so an interrupted download never leaves a truncated file that later runs trust.
const cached = async (file, what, write) => {
  if (!(await exists(file))) {
    log(`downloading ${what}`);
    await mkdir(path.dirname(file), { recursive: true });
    await write(`${file}.partial`);
    await rename(`${file}.partial`, file);
  }
  return file;
};

const cachedText = (file, what, url) => cached(file, what, async (partial) => {
  await writeFile(partial, await (await fetchOk(url)).text());
});

const downloadTable = async (table, build = BUILD) => {
  const file = path.join(CACHE_DIR, `${build === BUILD ? "wowf" : "era"}-${build}-hotfixes`, `${table}.csv`);
  await cachedText(file, `${table} (${build})`, `https://wago.tools/db2/${table}/csv?build=${build}&useHotfixes=true`);
  return parseCsv(await readFile(file, "utf8"));
};

const downloadQuestieFile = async (file) => {
  const target = path.join(CACHE_DIR, `questiedb-${QUESTIE_COMMIT}`, path.basename(file));
  await cachedText(target, `QuestieDB ${file}`,
    `https://raw.githubusercontent.com/Questie/QuestieDB/${QUESTIE_COMMIT}/${file}`);
  return readFile(target, "utf8");
};

// The CMaNGOS Classic world database dump, as SQL text. The 13 MB gzip is cached; unzipping takes about a second.
const loadClassicDb = async () => {
  const file = path.join(CACHE_DIR, `classicdb-${CLASSICDB_COMMIT}.sql.gz`);
  await cached(file, "the CMaNGOS Classic world database (13 MB, one time)", async (partial) => {
    const url = `https://raw.githubusercontent.com/cmangos/classic-db/${CLASSICDB_COMMIT}/${CLASSICDB_FILE}`;
    await writeFile(partial, Buffer.from(await (await fetchOk(url)).arrayBuffer()));
  });
  return gunzipSync(await readFile(file)).toString("utf8");
};

// Reads the community listfile and keeps only interface/icons/<name>.blp rows (id;path), cached trimmed.
const loadIconNames = async () => {
  const file = path.join(CACHE_DIR, `icons-${LISTFILE_TAG}.csv`);
  await cached(file, "listfile (large, one time)", async (partial) => {
    const url = `https://github.com/wowdev/wow-listfile/releases/download/${LISTFILE_TAG}/community-listfile.csv`;
    const response = await fetchOk(url);
    const lines = readline.createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity });
    const kept = (async function* () {
      for await (const line of lines) {
        if (line.includes(";interface/icons/")) {
          yield `${line}\n`;
        }
      }
    })();
    await pipeline(Readable.from(kept), createWriteStream(partial));
  });
  const icons = new Map();
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    // Names with spaces or other odd characters are listfile typos that 404 on zamimg: skipped, not guessed.
    const match = /^(\d+);interface\/icons\/([a-z0-9_]+)\.blp$/.exec(line);
    if (match) {
      icons.set(Number(match[1]), match[2]);
    }
  }
  return icons;
};

const byId = (rows) => new Map(rows.map((row) => [row.ID, row]));
// Rows of the base difficulty: the ones the game uses outside dungeons.
const baseRows = (rows) => rows.filter((row) => toInt(row.DifficultyID) === 0);
const recipeKeyOf = (recipe) => `${recipe.profession}:${recipe.id}`;
// Item ids a list of recipes creates or uses, in recipe order.
const referencedItems = (recipes) => new Set(recipes.flatMap((recipe) => [
  ...(recipe.item ? [recipe.item] : []), ...recipe.reagents.map((reagent) => reagent.item),
]));
const listOrNone = (values, separator = ", ") => values.join(separator) || "none";

// Professions: top-level skill lines (not the per-tier children) with a profession name and category.
const readProfessions = (skillLines) => PROFESSIONS.map(({ key, name, tier }) => {
  const matches = skillLines.filter((line) => line.DisplayName_lang === name
    && toInt(line.ParentSkillLineID) === 0 && PROFESSION_CATEGORIES.has(toInt(line.CategoryID)));
  if (matches.length !== 1) {
    throw new Error(`expected one top-level skill line named ${name}, found ${matches.length}`);
  }
  return { key, name, tier, skillLine: toInt(matches[0].ID) };
});

// Spell id to the spells its learn-spell effects teach.
const learnEffects = (effects) => {
  const learns = new Map();
  for (const effect of effects.filter((row) => toInt(row.Effect) === SPELL_EFFECT_LEARN_SPELL)) {
    appendTo(learns, toInt(effect.SpellID), toInt(effect.EffectTriggerSpell));
  }
  return learns;
};

/**
 * What teaches each recipe, and at which skill. `taughtByItem`: the recipe items (patterns, plans, formulas...) of
 * each spell; recipes without one are taught by a trainer or come with the profession (trainer lists live on the
 * server, so the client tables can't say which trainer). `levelOf(ability, key)`: the lowest skill a recipe item or a
 * trainer asks, or 1 for recipes that come with the profession, or undefined; `origin` records where each came from.
 * The client tables say 1 for nearly everything (SkillLineAbility.MinSkillLineRank), so they aren't used.
 */
const createLearning = (tables, classicDb, eraEffects, professions) => {
  const itemEffectById = new Map(tables.ItemEffect.map((row) => [
    toInt(row.ID), { spell: toInt(row.SpellID), trigger: toInt(row.TriggerType) },
  ]));
  const taughtByItem = spellsTaughtByItems(
    itemEffectById,
    tables.ItemXItemEffect.map((row) => ({ effect: toInt(row.ItemEffectID), item: toInt(row.ItemID) })),
    learnEffects(tables.SpellEffect),
  );
  const requiredRankByItem = new Map(tables.ItemSparse.map((row) => [toInt(row.ID), toInt(row.RequiredSkillRank)]));
  const trainerLevels = trainerSkillLevels(
    [...readSqlTable(classicDb, "npc_trainer"), ...readSqlTable(classicDb, "npc_trainer_template")],
    learnEffects([...tables.SpellEffect, ...eraEffects]),
    new Set(professions.map((profession) => profession.skillLine)),
  );
  const origin = new Map();
  const usedByHand = new Set();
  const levelOf = (ability, key) => {
    const spell = toInt(ability.Spell);
    // Item and trainer levels first. "Comes with the profession" (AcquireMethod 1) only says 1 when nothing else does.
    const candidates = [
      ...(taughtByItem.get(spell) ?? []).map((item) => ["item", requiredRankByItem.get(item) ?? 0]),
      ["trainer", trainerLevels.get(spell) ?? 0],
    ].filter(([, level]) => level > 0).sort(([, x], [, y]) => x - y);
    const byHand = LEARN_BY_HAND[key];
    if (byHand !== undefined) {
      if (candidates.length > 0) {
        throw new Error(`LEARN_BY_HAND ${key} is no longer needed: a ${candidates[0][0]} gives ${candidates[0][1]}. `
          + "Remove the entry.");
      }
      usedByHand.add(key);
      candidates.push(["hand", byHand]);
    }
    if (candidates.length === 0 && toInt(ability.AcquireMethod) === ACQUIRE_WITH_PROFESSION) {
      candidates.push(["profession", 1]);
    }
    if (candidates.length === 0) {
      return undefined;
    }
    origin.set(key, candidates[0][0]);
    return candidates[0][1];
  };
  const checkByHand = () => {
    const unused = Object.keys(LEARN_BY_HAND).filter((key) => !usedByHand.has(key));
    if (unused.length > 0) {
      throw new Error(`LEARN_BY_HAND names no recipe: ${unused.join(", ")}. Fix or remove the entries.`);
    }
  };
  return { itemEffectById, taughtByItem, levelOf, origin, checkByHand };
};

// The reagents of an ability's spell, from its SpellReagents row (absent for spells without reagents).
const readReagents = (spell, row, warnings) => {
  const reagents = [];
  for (let i = 0; i < MAX_REAGENTS && row; i += 1) {
    const item = toInt(row[`Reagent_${i}`]);
    if (item > 0) {
      const count = toInt(row[`ReagentCount_${i}`]);
      if (count < 1) {
        warnings.push(`spell ${spell} reagent ${item} has count ${count}, kept as 1`);
      }
      reagents.push({ item, count: Math.max(1, count) });
    }
  }
  return reagents;
};

// Recipes: one per (profession, spell) ability row that has reagents or creates an item.
const buildRecipes = (tables, professions, learning, warnings) => {
  const professionBySkillLine = new Map(professions.map((profession) => [profession.skillLine, profession]));
  const spellNameById = new Map(tables.SpellName.map((row) => [row.ID, row.Name_lang]));
  const reagentsBySpell = new Map(tables.SpellReagents.map((row) => [row.SpellID, row]));
  const createdBySpell = new Map();
  for (const effect of tables.SpellEffect) {
    if (toInt(effect.Effect) === SPELL_EFFECT_CREATE_ITEM && toInt(effect.EffectItemType) > 0
      && !createdBySpell.has(effect.SpellID)) {
      createdBySpell.set(effect.SpellID, effect);
    }
  }
  const recipes = [];
  const seen = new Set();
  for (const ability of tables.SkillLineAbility) {
    const profession = professionBySkillLine.get(toInt(ability.SkillLine));
    if (!profession) {
      continue;
    }
    const reagents = readReagents(ability.Spell, reagentsBySpell.get(ability.Spell), warnings);
    const created = createdBySpell.get(ability.Spell);
    const key = `${profession.key}:${ability.Spell}`;
    if ((reagents.length === 0 && !created) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const recipe = {
      id: toInt(ability.Spell),
      name: spellNameById.get(ability.Spell) ?? `Spell ${ability.Spell}`,
      profession: profession.key,
      category: toInt(ability.TradeSkillCategoryID),
      trivialLow: toInt(ability.TrivialSkillLineRankLow),
      trivialHigh: toInt(ability.TrivialSkillLineRankHigh),
      source: learning.taughtByItem.has(toInt(ability.Spell)) ? "item" : "trainer",
    };
    const learn = learning.levelOf(ability, key);
    if (learn !== undefined) {
      recipe.learn = learn;
    }
    if (!spellNameById.has(ability.Spell)) {
      warnings.push(`spell ${ability.Spell} has no name`);
    }
    if (created) {
      recipe.item = toInt(created.EffectItemType);
      // EffectBasePointsF holds the stack size; 0 is how the client stores a single item.
      recipe.count = Math.max(1, Math.round(Number(created.EffectBasePointsF)));
    }
    recipe.reagents = reagents;
    recipes.push(recipe);
  }
  learning.checkByHand();
  return recipes.sort((a, b) => a.id - b.id || a.profession.localeCompare(b.profession));
};

// Drops recipes with no category, in an excluded category or learnable above MAX_LEARN_SKILL, and reports them.
const dropExcluded = (recipes, categoryById) => {
  const excluded = new Set(EXCLUDED_CATEGORIES.map((name) => name.toLowerCase()));
  const tooHigh = (recipe) => (recipe.learn ?? 0) > MAX_LEARN_SKILL;
  const isExcluded = (recipe) => {
    const name = categoryById.get(String(recipe.category))?.Name_lang ?? "";
    // Category 0: an ability the profession window doesn't list (the old Basic Campfire; Camping has the new one).
    return recipe.category === 0 || excluded.has(name.toLowerCase()) || tooHigh(recipe);
  };
  const kept = recipes.filter((recipe) => !isExcluded(recipe));
  const dropped = recipes.filter(isExcluded);
  const keptItems = referencedItems(kept);
  const droppedItems = [...referencedItems(dropped)].filter((id) => !keptItems.has(id)).length;
  log(`dropped ${dropped.length} recipes (no category, ${EXCLUDED_CATEGORIES.join(", ")}, or learnable above `
    + `${MAX_LEARN_SKILL}) and ${droppedItems} items only they use`);
  log(`  without a category: ${listOrNone(dropped.filter((recipe) => recipe.category === 0)
    .map((recipe) => recipe.name))}`);
  log(`  above ${MAX_LEARN_SKILL}: ${listOrNone(recipes.filter(tooHigh)
    .map((recipe) => `${recipe.name} ${recipe.learn}`))}`);
  return kept;
};

// The spell tables `resolveDescription` reads, with DESCRIPTION_PATCHES applied.
const createSpellLookup = (tables) => {
  const spellText = new Map(tables.Spell.map((row) => [toInt(row.ID), row.Description_lang]));
  for (const { spell, from, to } of DESCRIPTION_PATCHES) {
    const text = spellText.get(spell) ?? "";
    if (!text.includes(from)) {
      throw new Error(`description patch for spell ${spell} no longer applies: ${from} is gone, remove the patch`);
    }
    spellText.set(spell, text.replaceAll(from, to));
  }
  const radiusById = new Map(tables.SpellRadius.map((row) => [toInt(row.ID), Number(row.Radius)]));
  const effectByKey = new Map(baseRows(tables.SpellEffect).map((row) => [`${row.SpellID}:${row.EffectIndex}`, {
    base: Number(row.EffectBasePointsF),
    variance: Number(row.Variance),
    period: toInt(row.EffectAuraPeriod),
    radius: radiusById.get(toInt(row.EffectRadiusIndex_0)) ?? 0,
  }]));
  const durationById = new Map(tables.SpellDuration.map((row) => [toInt(row.ID), toInt(row.Duration)]));
  const durationBySpell = new Map(baseRows(tables.SpellMisc).map((row) => [
    toInt(row.SpellID), durationById.get(toInt(row.DurationIndex)),
  ]));
  const stacksBySpell = new Map(baseRows(tables.SpellAuraOptions)
    .map((row) => [toInt(row.SpellID), toInt(row.CumulativeAura)]));
  return {
    description: (id) => spellText.get(id),
    effect: (id, index) => effectByKey.get(`${id}:${index}`),
    duration: (id) => durationBySpell.get(id),
    stacks: (id) => stacksBySpell.get(id),
  };
};

// Gear has Item.IconFileDataID 0: its icon is the default icon of its first (lowest id, base modifier) appearance.
const gearIcons = (tables) => {
  const appearanceIconById = new Map(tables.ItemAppearance.map((row) => [row.ID, toInt(row.DefaultIconFileDataID)]));
  const iconByItem = new Map();
  for (const link of tables.ItemModifiedAppearance.filter((row) => toInt(row.ItemAppearanceModifierID) === 0)
    .sort((a, b) => toInt(a.ID) - toInt(b.ID))) {
    const icon = appearanceIconById.get(link.ItemAppearanceID);
    if (icon && !iconByItem.has(link.ItemID)) {
      iconByItem.set(link.ItemID, icon);
    }
  }
  return iconByItem;
};

/**
 * Items: only those the recipes reference, with their "Use:" texts (the $ tokens resolved; a token the resolver
 * doesn't know fails the build: extend scripts/descriptions.mjs rather than shipping "$s1"). Also returns each
 * item's class, and the ids named after their recipe or not named at all, for the report.
 */
const buildItems = (tables, recipes, icons, itemEffectById, warnings) => {
  const spells = createSpellLookup(tables);
  const useSpellsByItem = new Map();
  for (const link of tables.ItemXItemEffect) {
    const effect = itemEffectById.get(toInt(link.ItemEffectID));
    if (effect && effect.trigger === TRIGGER_USE) {
      appendTo(useSpellsByItem, toInt(link.ItemID), effect.spell);
    }
  }
  const unresolvedTokens = [];
  const useTexts = (itemId) => (useSpellsByItem.get(itemId) ?? []).map((spell) => {
    const { text, unresolved } = resolveDescription(spell, spells);
    unresolved.forEach((token) => unresolvedTokens.push(`item ${itemId} (spell ${spell}): ${token}`));
    return text;
  }).filter(Boolean);

  const itemById = byId(tables.Item);
  const sparseById = byId(tables.ItemSparse);
  const gearIconByItem = gearIcons(tables);
  // Items missing from ItemSparse have no client name: a created item falls back to its recipe's spell name.
  const recipeNameByItem = new Map();
  for (const recipe of recipes) {
    if (recipe.item && !recipeNameByItem.has(recipe.item)) {
      recipeNameByItem.set(recipe.item, recipe.name);
    }
  }
  const itemIds = referencedItems(recipes);
  const items = {};
  const classes = new Map();
  const nameFromRecipe = [];
  const unnamed = [];
  let withoutIcon = 0;
  for (const id of [...itemIds].sort((a, b) => a - b)) {
    const item = itemById.get(String(id));
    const sparse = sparseById.get(String(id));
    if (!item) {
      warnings.push(`item ${id} missing from Item`);
    }
    const icon = icons.get(toInt(item?.IconFileDataID) || gearIconByItem.get(String(id)) || 0) ?? null;
    if (!icon) {
      withoutIcon += 1;
    }
    let name = sparse?.Display_lang;
    if (!name) {
      name = recipeNameByItem.get(id);
      (name ? nameFromRecipe : unnamed).push(id);
    }
    // Without an ItemSparse row there is no quality either: default to common (1).
    items[id] = { name: name || `Item ${id}`, quality: sparse ? toInt(sparse.OverallQualityID) : 1, icon };
    const use = useTexts(id);
    if (use.length > 0) {
      items[id].use = use;
    }
    classes.set(id, { classId: toInt(item?.ClassID), subclassId: toInt(item?.SubclassID) });
  }
  if (unresolvedTokens.length > 0) {
    throw new Error(`unresolved description tokens:\n  ${unresolvedTokens.join("\n  ")}`);
  }
  return { items, itemIds, classes, nameFromRecipe, unnamed, withoutIcon };
};

// Hand-written gatherables classified with the rest. An id the client doesn't know is a typo: fail. One that no kept
// recipe uses is left out of the data and returned for the report.
const readGatherables = (itemById, itemIds, classes, recipes) => {
  const allowLists = { fishing: FISHING_ITEMS, herbalism: HERBALISM_ITEMS };
  const gatherables = classifyGatherables(classes, recipes, allowLists);
  const unusedAllowed = [];
  for (const id of Object.values(allowLists).flat()) {
    if (!itemById.has(String(id))) {
      throw new Error(`allow-listed item ${id} is not in the client's Item table`);
    }
    if (!itemIds.has(id)) {
      unusedAllowed.push(id);
    }
  }
  return { gatherables, unusedAllowed };
};

// The professions as the app reads them: the categories their recipes use, in game order, and their gatherables.
const professionOutput = (professions, recipes, categoryById, gatherables) => professions.map((profession) => {
  const used = new Set(recipes.filter((recipe) => recipe.profession === profession.key)
    .map((recipe) => recipe.category));
  const categories = [...used].map((id) => {
    const row = categoryById.get(String(id));
    return { id, name: row?.Name_lang || "Other", order: toInt(row?.OrderIndex) };
  }).sort((a, b) => a.order - b.order || a.id - b.id).map(({ id, name }) => ({ id, name }));
  return { ...profession, categories, gatherables: gatherables[profession.key] ?? [] };
});

// Herb locations: zone names per Herbalism gatherable, most spawns first, through LOCATION_RULES.
const locateHerbs = (itemById, locatable, questieObjects, areaNames, unnamedZones) => {
  // A rule item the client doesn't know is a typo: fail. One that is no kept Herbalism gatherable is left out.
  const skippedRuleItems = new Set();
  const rules = LOCATION_RULES.map((rule) => ({
    ...rule,
    items: rule.items.filter((item) => {
      if (!itemById.has(String(item))) {
        throw new Error(`location rule item ${item} is not in the client's Item table`);
      }
      if (!locatable.has(item)) {
        skippedRuleItems.add(item);
      }
      return locatable.has(item);
    }),
  })).filter((rule) => rule.items.length > 0);
  const { located, unmatched } = locateItems(questieObjects, rules);
  const zonesByItem = {};
  for (const item of [...located.keys()].sort((a, b) => a - b)) {
    const { names, unnamed } = zoneNamesByCount(located.get(item), areaNames);
    unnamed.forEach((zone) => unnamedZones.add(zone));
    if (names.length > 0) {
      zonesByItem[item] = names;
    }
  }
  return { zonesByItem, skippedRuleItems, unmatched };
};

// Recipe sources: for each recipe taught by an item, where its items are sold, by side, and whether a quest rewards
// them or something drops them. See recipeItemSources.
const sourceRecipes = (recipes, taughtByItem, [itemTexts, npcTexts, questTexts], areaNames) => {
  const itemsByRecipe = new Map(recipes.filter((recipe) => recipe.source === "item")
    .map((recipe) => [recipeKeyOf(recipe), taughtByItem.get(recipe.id)]));
  return recipeItemSources(itemsByRecipe, {
    items: readQuestieTable(...itemTexts, "item", QUESTIE_ITEM_FIELDS),
    npcs: readQuestieTable(...npcTexts, "npc", QUESTIE_NPC_FIELDS),
    quests: readQuestieTable(...questTexts, "quest", QUESTIE_QUEST_FIELDS),
  }, (zone) => areaNames.get(zone), CAPITAL_ZONES);
};

// Fish locations: the zones whose fishing loot has them (CMaNGOS, by AreaTable id, subzones counted as their zone),
// then the zones where a pool that yields them spawns (pool loot from CMaNGOS, pool spawns from QuestieDB).
const locateFish = (fish, classicDb, areaRows, questieObjects, unnamedZones) => {
  const areaNames = new Map(areaRows.map((row) => [toInt(row.ID), row.AreaName_lang]));
  const parentById = new Map(areaRows.map((row) => [toInt(row.ID), toInt(row.ParentAreaID)]));
  const zoneOf = (area) => {
    let zone = area;
    for (let depth = 0; parentById.get(zone) && depth < 10; depth += 1) {
      zone = parentById.get(zone);
    }
    return zone;
  };
  const references = readSqlTable(classicDb, "reference_loot_template");
  const fishedIn = fishingAreas(readSqlTable(classicDb, "fishing_loot_template"), references, fish);
  const yields = poolYields(readSqlTable(classicDb, "gameobject_template"),
    readSqlTable(classicDb, "gameobject_loot_template"), references, fish);
  const zonesByItem = {};
  const fishWithout = [];
  for (const item of fish) {
    const chances = new Map();
    for (const [area, chance] of fishedIn.get(item) ?? []) {
      const name = areaNames.get(zoneOf(area));
      if (!name) {
        unnamedZones.add(area);
      } else {
        chances.set(name, Math.max(chances.get(name) ?? 0, chance));
      }
    }
    const spawns = new Map();
    for (const [pool, caught] of yields) {
      if (!caught.includes(item)) {
        continue;
      }
      for (const [zone, count] of questieObjects.get(pool)?.zones ?? []) {
        const name = areaNames.get(zoneOf(zone));
        if (name) {
          addTo(spawns, name, count);
        } else {
          unnamedZones.add(zone);
        }
      }
    }
    const names = orderFishZones(chances, spawns);
    if (names.length > 0) {
      zonesByItem[item] = names;
    } else {
      fishWithout.push(item);
    }
  }
  return { zonesByItem, fishWithout };
};

const writeData = async (files) => {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    await writeFile(path.join(OUT_DIR, name), JSON.stringify(data));
  }
};

// The report `docs/DATA.md` explains, line by line.
const report = ({
  output, recipes, items, itemIds, classes, itemById, sparseById, gatherables, locatable, locationItems, herbs,
  fishWithout, unnamedZones, learnOrigin, unusedAllowed, nameFromRecipe, unnamed, withoutIcon, recipeSources, warnings,
}) => {
  const named = (ids) => listOrNone(ids.map((id) => `${id} ${items[id].name}`));
  log(`\nbuild ${BUILD}, listfile ${LISTFILE_TAG}`);
  log("\nprofession       recipes  gatherables");
  for (const profession of output) {
    const count = recipes.filter((recipe) => recipe.profession === profession.key).length;
    const gatherableCount = String(profession.gatherables.length).padStart(11);
    log(`${profession.name.padEnd(16)} ${String(count).padStart(7)}  ${gatherableCount}`);
  }
  const herbsLocated = [...locatable].filter((id) => locationItems[id]).length;
  log(`\nlocations for ${herbsLocated} of ${locatable.size} Herbalism gatherables`);
  for (const key of LOCATION_PROFESSIONS) {
    log(`  ${key} without locations: ${named((gatherables[key] ?? []).filter((id) => !locationItems[id]))}`);
  }
  log(`  rule items that are no kept Herbalism gatherable, left out: ${listOrNone([...herbs.skippedRuleItems])}`);
  log(`\nfish without locations: ${named(fishWithout)}`);
  log(`  rules matching no object with spawns: ${listOrNone(herbs.unmatched
    .map((rule) => rule.node ?? rule.ids.join("/")))}`);
  log(`  spawn zones without an AreaTable name, skipped: ${listOrNone([...unnamedZones])}`);

  const fromItems = recipes.filter((recipe) => recipe.source === "item").length;
  const unknownLearn = recipes.filter((recipe) => recipe.learn === undefined);
  const fromOrigin = (origin) => recipes.filter((recipe) => learnOrigin.get(recipeKeyOf(recipe)) === origin).length;
  log(`\nlearnable level from a recipe item ${fromOrigin("item")}, a trainer ${fromOrigin("trainer")}, `
    + `the profession ${fromOrigin("profession")}, by hand ${fromOrigin("hand")}, unknown ${unknownLearn.length}:`);
  log(`  ${listOrNone(unknownLearn.map((recipe) => `${recipe.profession}:${recipe.name}`))}`);
  log(`\nrecipes taught by an item ${fromItems}, by a trainer or with the profession ${recipes.length - fromItems}`);
  const unsourced = recipes.filter((recipe) => recipe.source === "item"
    && !recipeSources.byRecipe.has(recipeKeyOf(recipe)));
  log(`  with no known vendor, quest or drop ${unsourced.length}: `
    + `${listOrNone(unsourced.map((recipe) => `${recipe.profession}:${recipe.name}`))}`);
  log(`  recipe vendor zones without an AreaTable name, skipped: ${listOrNone([...recipeSources.unnamedZones])}`);
  log(`  recipe vendors missing from the NPC table: ${listOrNone([...recipeSources.unknownNpcs])}`);
  const undescribed = recipes.filter((recipe) => !items[recipe.item]?.use).map((recipe) => recipe.name);
  log(`\nitems with a "Use:" text ${Object.values(items).filter((item) => item.use).length} of ${itemIds.size}; `
    + `recipes whose item has none: ${undescribed.length}`);
  log(`  ${listOrNone(undescribed)}`);
  log(`\nallow-listed items no kept recipe uses, left out: ${listOrNone(unusedAllowed)}`);
  log(`\nrecipes ${recipes.length}, items ${itemIds.size}, items without icon ${withoutIcon}`);

  // Validation of the gatherable assumptions against the live data.
  const created = new Set(recipes.filter((recipe) => recipe.item).map((recipe) => recipe.item));
  const gathered = new Map(Object.entries(gatherables)
    .flatMap(([profession, ids]) => ids.map((id) => [id, profession])));
  const uncrafted = [...itemIds].filter((itemId) => !created.has(itemId));
  log("\nreagents whose bag family disagrees with their assigned gatherer:");
  for (const id of uncrafted) {
    const family = toInt(sparseById.get(String(id))?.BagFamily);
    for (const check of BAG_FAMILY_CHECKS) {
      if ((family & check.bit) && gathered.get(id) !== check.profession) {
        const { classId, subclassId } = classes.get(id);
        const assigned = gathered.get(id) ?? "none";
        log(`  ${id} ${items[id].name}: ${check.label}, class ${classId}/${subclassId}, assigned ${assigned}`);
      }
    }
  }
  log("\nuncrafted reagents with pet food type fish (ItemPetFoodID 2), class 7 subclass 8 only:");
  for (const id of uncrafted) {
    const { classId, subclassId } = classes.get(id);
    if (classId === 7 && subclassId === 8 && toInt(itemById.get(String(id))?.ItemPetFoodID) === FISH_PET_FOOD) {
      log(`  ${id} ${items[id].name}`);
    }
  }
  log("\nuncrafted reagents assigned to no gatherer, class 7, 12 or 15:");
  for (const id of uncrafted.filter((itemId) => !gathered.has(itemId))) {
    const { classId, subclassId } = classes.get(id);
    if (classId === 7 || classId === 15 || classId === 12) {
      log(`  ${id} ${items[id].name} (${classId}/${subclassId})`);
    }
  }
  log(`\nitems named after their recipe (no ItemSparse row), quality defaulted to 1: ${nameFromRecipe.length}`);
  log(`items with no name at all (shown as "Item <id>"), quality defaulted to 1: ${unnamed.length}`);
  log(`  ${unnamed.map((id) => `${id}${gathered.has(id) ? "*" : ""}`).join(",")}`);
  log("\nwarnings:", warnings.length);
  for (const warning of warnings) {
    log(`  ${warning}`);
  }
};

const main = async () => {
  const tables = Object.fromEntries(await Promise.all(TABLES.map(async (table) => [
    table, await downloadTable(table),
  ])));
  const [icons, classicDb, eraEffects, questieTexts, questieSourceTexts] = await Promise.all([
    loadIconNames(), loadClassicDb(), downloadTable("SpellEffect", ERA_BUILD),
    Promise.all(QUESTIE_OBJECT_FILES.map(downloadQuestieFile)),
    Promise.all(Object.values(QUESTIE_SOURCE_FILES).map((files) => Promise.all(files.map(downloadQuestieFile)))),
  ]);
  const warnings = [];
  const professions = readProfessions(tables.SkillLine);
  const categoryById = byId(tables.TradeSkillCategory);
  const learning = createLearning(tables, classicDb, eraEffects, professions);
  const recipes = dropExcluded(buildRecipes(tables, professions, learning, warnings), categoryById);
  const { items, itemIds, classes, nameFromRecipe, unnamed, withoutIcon } = buildItems(
    tables, recipes, icons, learning.itemEffectById, warnings,
  );
  const itemById = byId(tables.Item);
  const { gatherables, unusedAllowed } = readGatherables(itemById, itemIds, classes, recipes);
  const output = professionOutput(professions, recipes, categoryById, gatherables);

  const areaNames = new Map(tables.AreaTable.map((row) => [toInt(row.ID), row.AreaName_lang]));
  const questieObjects = readQuestieObjects(...questieTexts);
  const locatable = new Set(LOCATION_PROFESSIONS.flatMap((key) => gatherables[key] ?? []));
  const unnamedZones = new Set();
  const herbs = locateHerbs(itemById, locatable, questieObjects, areaNames, unnamedZones);
  const fish = locateFish(gatherables.fishing ?? [], classicDb, tables.AreaTable, questieObjects, unnamedZones);
  const locationItems = { ...herbs.zonesByItem, ...fish.zonesByItem };
  const recipeSources = sourceRecipes(recipes, learning.taughtByItem, questieSourceTexts, areaNames);

  await writeData({
    "locations.json": {
      source: `QuestieDB ${QUESTIE_COMMIT} (GPLv3, https://github.com/Questie/QuestieDB): `
        + "only the zones each node and fishing pool spawns in, and the zones, sides, quests and drops recipe items "
        + "come from, no files or coordinates. "
        + `CMaNGOS classic-db ${CLASSICDB_COMMIT} (GPLv3, https://github.com/cmangos/classic-db): `
        + "only the zones each fish is caught in and the fish each pool yields, no files or rows",
      build: BUILD,
      items: locationItems,
      recipes: Object.fromEntries(recipeSources.byRecipe),
    },
    "professions.json": output,
    "recipes.json": recipes,
    "items.json": items,
  });

  report({
    output, recipes, items, itemIds, classes, itemById, sparseById: byId(tables.ItemSparse), gatherables, locatable,
    locationItems, herbs, fishWithout: fish.fishWithout, unnamedZones, learnOrigin: learning.origin, unusedAllowed,
    nameFromRecipe, unnamed, withoutIcon, recipeSources, warnings,
  });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
