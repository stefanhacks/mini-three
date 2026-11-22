import {
  CLOTH_KEY, type Item, type Profession, type ProfessionKey, type Recipe, items, locations, professions, recipes,
} from ".";

/** Icon basenames (zamimg) for the profession tabs, picker and portrait. */
export const PROFESSION_ICONS: Record<ProfessionKey, string> = {
  alchemy: "trade_alchemy",
  blacksmithing: "trade_blacksmithing",
  enchanting: "trade_engraving",
  engineering: "trade_engineering",
  leatherworking: "inv_misc_armorkit_17",
  tailoring: "trade_tailoring",
  herbalism: "spell_nature_naturetouchgrow",
  mining: "trade_mining",
  skinning: "inv_misc_pelt_wolf_01",
  cooking: "inv_misc_food_15",
  "first-aid": "spell_holy_sealofsacrifice",
  fishing: "trade_fishing",
  poisons: "trade_brewpoison",
  [CLOTH_KEY]: "inv_fabric_linen_01",
};

/** Picker groups, in display order. */
export const PROFESSION_GROUPS: { title: string; keys: ProfessionKey[] }[] = [
  { title: "Crafting", keys: ["alchemy", "blacksmithing", "enchanting", "engineering", "leatherworking", "tailoring"] },
  { title: "Gathering", keys: ["herbalism", "mining", "skinning", CLOTH_KEY] },
  { title: "Secondary", keys: ["cooking", "first-aid", "fishing", "poisons"] },
];

export const professionByKey = new Map<ProfessionKey, Profession>(professions.map((p) => [p.key, p]));

export const recipesByProfession = new Map<ProfessionKey, Recipe[]>();
/** Item id to the recipes that use it as a reagent. */
export const recipesUsingItem = new Map<number, Recipe[]>();

recipes.forEach((recipe) => {
  const list = recipesByProfession.get(recipe.profession) ?? [];
  list.push(recipe);
  recipesByProfession.set(recipe.profession, list);
  recipe.reagents.forEach(({ item }) => {
    const users = recipesUsingItem.get(item) ?? [];
    users.push(recipe);
    recipesUsingItem.set(item, users);
  });
});

/** Profession that lists an item as a gatherable, if any (first match). */
export const gathererOf = (itemId: number): Profession | undefined =>
  professions.find((p) => p.gatherables.includes(itemId));

export const itemOf = (id: number): Item => items[String(id)] ?? { name: `Item ${id}`, quality: 1, icon: null };

export const recipeKey = (recipe: Recipe): string => `${recipe.profession}:${recipe.id}`;

/** Zone names where an item's node spawns (most spawns first). Empty for items without known nodes. */
export const locationsOf = (id: number): string[] => locations.items[String(id)] ?? [];
