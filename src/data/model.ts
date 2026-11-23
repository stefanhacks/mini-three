import {
  type Item, type Profession, type ProfessionKey, type Recipe, items, locations, professions, recipes,
} from ".";

/** Icon basenames (zamimg) for the profession tabs, picker and portrait. */
export const PROFESSION_ICONS: Record<ProfessionKey, string> = {
  alchemy: "trade_alchemy",
  herbalism: "spell_nature_naturetouchgrow",
  cooking: "inv_misc_food_15",
  fishing: "trade_fishing",
  "first-aid": "spell_holy_sealofsacrifice",
};

/** Picker groups, in display order. The picker goes away with the fixed tabs. */
export const PROFESSION_GROUPS: { title: string; keys: ProfessionKey[] }[] = [
  { title: "Primary", keys: ["alchemy", "herbalism"] },
  { title: "Secondary", keys: ["cooking", "fishing", "first-aid"] },
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
