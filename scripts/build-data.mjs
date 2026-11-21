// Builds src/data/*.json from the WoW: Forever client DB2 tables (wago.tools, product wowf).
// Run with `npm run data`. Downloads are cached in .cache/; the output JSON is committed.
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CLOTH_KEY, classifyGatherables, parseCsv, toInt } from "./data-lib.mjs";

// Pinned inputs: change them on purpose, and the output changes with them.
// Tables are fetched with useHotfixes=true. It is an undocumented wago.tools query parameter (found by trying it):
// without it ItemSparse lacks ~6,000 live items, so names and qualities go missing.
const BUILD = "1.60.1.71037";
const LISTFILE_TAG = "202611211242";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache");
const OUT_DIR = path.join(ROOT, "src", "data");

// The 13 profession skill lines, in display order. Matched by name among top-level SkillLines.
const PROFESSIONS = [
  { key: "alchemy", name: "Alchemy" },
  { key: "blacksmithing", name: "Blacksmithing" },
  { key: "enchanting", name: "Enchanting" },
  { key: "engineering", name: "Engineering" },
  { key: "leatherworking", name: "Leatherworking" },
  { key: "tailoring", name: "Tailoring" },
  { key: "herbalism", name: "Herbalism" },
  { key: "mining", name: "Mining" },
  { key: "skinning", name: "Skinning" },
  { key: "cooking", name: "Cooking" },
  { key: "first-aid", name: "First Aid" },
  { key: "fishing", name: "Fishing" },
  { key: "poisons", name: "Poisons" },
];
// SkillLine.CategoryID: 11 is a main profession, 9 a secondary one (the others are weapons, languages, riding...).
const PROFESSION_CATEGORIES = new Set([9, 11]);

const TABLES = [
  "SkillLine", "SkillLineAbility", "TradeSkillCategory", "SpellName", "SpellReagents", "SpellEffect",
  "Item", "ItemSparse", "ItemModifiedAppearance", "ItemAppearance",
];

const SPELL_EFFECT_CREATE_ITEM = 24;
const MAX_REAGENTS = 8;
const FISH_PET_FOOD = 2;

// Recipes in these TradeSkillCategory names are dropped (matched by name, case-insensitive).
const EXCLUDED_CATEGORIES = ["SEASON OF DISCOVERY"];

// Hand-written gatherables, because the item tables cannot tell them apart. Ids must be uncrafted reagents.
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
];
// Herb-bag items that Herbalism gathers but are not class 7 subclass 9 (seeds are class 15, Morrowgrain class 12).
const HERBALISM_ITEMS = [
  5173, // Deathweed
  11040, // Morrowgrain
  17034, // Maple Seed
  17035, // Stranglethorn Seed
];
// Gems that drop from mining veins in Classic. They are class 7 subclass 11 ("other"), so Mining can't be inferred.
const MINING_GEMS = [
  774, // Malachite
  818, // Tigerseye
  1206, // Moss Agate
  1210, // Shadowgem
  1529, // Jade
  1705, // Lesser Moonstone
  3864, // Citrine
  7909, // Aquamarine
  7910, // Star Ruby
  12361, // Blue Sapphire
  12363, // Arcane Crystal
  12364, // Huge Emerald
  12799, // Large Opal
  12800, // Azerothian Diamond
];
// ItemSparse.BagFamily bits that name the profession bag an item belongs in.
const BAG_FAMILY_CHECKS = [
  { bit: 8, label: "leatherworking bag", profession: "skinning" },
  { bit: 32, label: "herb bag", profession: "herbalism" },
  { bit: 1024, label: "mining bag", profession: "mining" },
];

const log = (...args) => console.log(...args);

const fetchOk = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response;
};

const exists = (file) => readFile(file).then(() => true, () => false);

const downloadTable = async (table) => {
  const file = path.join(CACHE_DIR, `wowf-${BUILD}-hotfixes`, `${table}.csv`);
  if (!(await exists(file))) {
    log(`downloading ${table}`);
    const response = await fetchOk(`https://wago.tools/db2/${table}/csv?build=${BUILD}&useHotfixes=true`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, await response.text());
  }
  return parseCsv(await readFile(file, "utf8"));
};

// Reads the community listfile and keeps only interface/icons/<name>.blp rows (id;path), cached trimmed.
const loadIconNames = async () => {
  const file = path.join(CACHE_DIR, `icons-${LISTFILE_TAG}.csv`);
  if (!(await exists(file))) {
    const url = `https://github.com/wowdev/wow-listfile/releases/download/${LISTFILE_TAG}/community-listfile.csv`;
    log("downloading listfile (large, one time)");
    const response = await fetchOk(url);
    await mkdir(CACHE_DIR, { recursive: true });
    const partial = `${file}.partial`;
    const out = createWriteStream(partial);
    const lines = readline.createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity });
    const kept = (async function* () {
      for await (const line of lines) {
        if (line.includes(";interface/icons/")) {
          yield `${line}\n`;
        }
      }
    })();
    await pipeline(Readable.from(kept), out);
    await rename(partial, file);
  }
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

const main = async () => {
  const tables = await Promise.all(TABLES.map(downloadTable));
  const [skillLines, abilities, tradeCategories, spellNames, reagentRows, effects, itemRows, sparseRows,
    appearanceLinks, appearances] = tables;
  const icons = await loadIconNames();

  // Professions: top-level skill lines (not the per-tier children) with a profession name and category.
  const professions = PROFESSIONS.map(({ key, name }) => {
    const matches = skillLines.filter((line) => line.DisplayName_lang === name
      && toInt(line.ParentSkillLineID) === 0 && PROFESSION_CATEGORIES.has(toInt(line.CategoryID)));
    if (matches.length !== 1) {
      throw new Error(`expected one top-level skill line named ${name}, found ${matches.length}`);
    }
    return { key, name, skillLine: toInt(matches[0].ID) };
  });
  const professionBySkillLine = new Map(professions.map((profession) => [profession.skillLine, profession]));

  const spellNameById = new Map(spellNames.map((row) => [row.ID, row.Name_lang]));
  const reagentsBySpell = new Map(reagentRows.map((row) => [row.SpellID, row]));
  const createdBySpell = new Map();
  for (const effect of effects) {
    if (toInt(effect.Effect) === SPELL_EFFECT_CREATE_ITEM && toInt(effect.EffectItemType) > 0
      && !createdBySpell.has(effect.SpellID)) {
      createdBySpell.set(effect.SpellID, effect);
    }
  }
  const categoryById = byId(tradeCategories);

  // Recipes: one per (profession, spell) ability row that has reagents or creates an item.
  const recipes = [];
  const seen = new Set();
  const warnings = [];
  for (const ability of abilities) {
    const profession = professionBySkillLine.get(toInt(ability.SkillLine));
    if (!profession) {
      continue;
    }
    const reagentRow = reagentsBySpell.get(ability.Spell);
    const created = createdBySpell.get(ability.Spell);
    const reagents = [];
    for (let i = 0; i < MAX_REAGENTS && reagentRow; i += 1) {
      const item = toInt(reagentRow[`Reagent_${i}`]);
      if (item > 0) {
        const count = toInt(reagentRow[`ReagentCount_${i}`]);
        if (count < 1) {
          warnings.push(`spell ${ability.Spell} reagent ${item} has count ${count}, kept as 1`);
        }
        reagents.push({ item, count: Math.max(1, count) });
      }
    }
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
      minSkill: toInt(ability.MinSkillLineRank),
      trivialLow: toInt(ability.TrivialSkillLineRankLow),
      trivialHigh: toInt(ability.TrivialSkillLineRankHigh),
    };
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
  recipes.sort((a, b) => a.id - b.id || a.profession.localeCompare(b.profession));

  const referencedItems = (list) => new Set(list.flatMap((recipe) => [
    ...(recipe.item ? [recipe.item] : []), ...recipe.reagents.map((reagent) => reagent.item),
  ]));
  const excluded = new Set(EXCLUDED_CATEGORIES.map((name) => name.toLowerCase()));
  const isExcluded = (recipe) => {
    const name = categoryById.get(String(recipe.category))?.Name_lang ?? "";
    return excluded.has(name.toLowerCase());
  };
  const dropped = recipes.filter(isExcluded);
  recipes.splice(0, recipes.length, ...recipes.filter((recipe) => !isExcluded(recipe)));
  const keptItems = referencedItems(recipes);
  const droppedItems = [...referencedItems(dropped)].filter((id) => !keptItems.has(id)).length;
  log(`dropped ${dropped.length} recipes (${EXCLUDED_CATEGORIES.join(", ")}) and ${droppedItems} items only they use`);

  // Items: only those the recipes reference.
  const itemById = byId(itemRows);
  // Gear has Item.IconFileDataID 0: its icon is the default icon of its first (lowest id, base modifier) appearance.
  const appearanceIconById = new Map(appearances.map((row) => [row.ID, toInt(row.DefaultIconFileDataID)]));
  const gearIconByItem = new Map();
  for (const link of appearanceLinks.filter((row) => toInt(row.ItemAppearanceModifierID) === 0)
    .sort((a, b) => toInt(a.ID) - toInt(b.ID))) {
    const icon = appearanceIconById.get(link.ItemAppearanceID);
    if (icon && !gearIconByItem.has(link.ItemID)) {
      gearIconByItem.set(link.ItemID, icon);
    }
  }
  const sparseById = byId(sparseRows);
  const itemIds = new Set();
  for (const recipe of recipes) {
    if (recipe.item) {
      itemIds.add(recipe.item);
    }
    for (const reagent of recipe.reagents) {
      itemIds.add(reagent.item);
    }
  }
  // Items missing from ItemSparse have no client name: a created item falls back to its recipe's spell name.
  const recipeNameByItem = new Map();
  for (const recipe of recipes) {
    if (recipe.item && !recipeNameByItem.has(recipe.item)) {
      recipeNameByItem.set(recipe.item, recipe.name);
    }
  }
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
    const iconFile = toInt(item?.IconFileDataID) || gearIconByItem.get(String(id)) || 0;
    const icon = icons.get(iconFile) ?? null;
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
    classes.set(id, { classId: toInt(item?.ClassID), subclassId: toInt(item?.SubclassID) });
  }

  // Gatherables per profession.
  const allowLists = { fishing: FISHING_ITEMS, mining: MINING_GEMS, herbalism: HERBALISM_ITEMS };
  const gatherables = classifyGatherables(classes, recipes, allowLists);
  for (const id of [...FISHING_ITEMS, ...MINING_GEMS, ...HERBALISM_ITEMS]) {
    if (!keptItems.has(id) || recipes.some((recipe) => recipe.item === id)) {
      throw new Error(`allow-listed item ${id} is not an uncrafted reagent in the data`);
    }
  }

  // Categories per profession, in game order. Category 0 means the ability has none.
  const output = professions.map((profession) => {
    const used = new Set(recipes.filter((recipe) => recipe.profession === profession.key)
      .map((recipe) => recipe.category));
    const categories = [...used].map((id) => {
      const row = categoryById.get(String(id));
      return { id, name: row?.Name_lang || "Other", order: toInt(row?.OrderIndex) };
    }).sort((a, b) => a.order - b.order || a.id - b.id).map(({ id, name }) => ({ id, name }));
    return { ...profession, categories, gatherables: gatherables[profession.key] ?? [] };
  });

  // Cloth is no SkillLine: a synthetic entry, listed like a gathering profession.
  output.push({
    key: CLOTH_KEY, name: "Cloth", skillLine: null, synthetic: true, categories: [],
    gatherables: gatherables[CLOTH_KEY] ?? [],
  });

  await mkdir(OUT_DIR, { recursive: true });
  const files = {
    "professions.json": output,
    "recipes.json": recipes,
    "items.json": items,
  };
  for (const [name, data] of Object.entries(files)) {
    await writeFile(path.join(OUT_DIR, name), JSON.stringify(data));
  }

  // Report.
  log(`\nbuild ${BUILD}, listfile ${LISTFILE_TAG}`);
  log("\nprofession       recipes  gatherables");
  for (const profession of output) {
    const count = recipes.filter((recipe) => recipe.profession === profession.key).length;
    const gatherableCount = String(profession.gatherables.length).padStart(11);
    log(`${profession.name.padEnd(16)} ${String(count).padStart(7)}  ${gatherableCount}`);
  }
  log(`\nrecipes ${recipes.length}, items ${itemIds.size}, items without icon ${withoutIcon}`);

  // Validation of the gatherable assumptions against the live data.
  const created = new Set(recipes.filter((recipe) => recipe.item).map((recipe) => recipe.item));
  const gathered = new Map();
  for (const [profession, ids] of Object.entries(gatherables)) {
    for (const id of ids) {
      gathered.set(id, profession);
    }
  }
  log("\nreagents whose bag family disagrees with their assigned gatherer:");
  for (const id of [...itemIds].filter((itemId) => !created.has(itemId))) {
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
  for (const id of [...itemIds].filter((itemId) => !created.has(itemId))) {
    const { classId, subclassId } = classes.get(id);
    if (classId === 7 && subclassId === 8 && toInt(itemById.get(String(id))?.ItemPetFoodID) === FISH_PET_FOOD) {
      log(`  ${id} ${items[id].name}`);
    }
  }
  log("\nuncrafted reagents assigned to no gatherer, class 7 and herb/ore/hide-like names:");
  for (const id of [...itemIds].filter((itemId) => !created.has(itemId) && !gathered.has(itemId))) {
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
