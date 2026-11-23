import { appendTo, groupBy } from "../collections";
import {
  type Item, type Profession, type ProfessionKey, type Recipe, items, locations, professions, recipes,
} from ".";

/** Icon basenames (zamimg) for the profession tabs and portrait. */
export const PROFESSION_ICONS: Record<ProfessionKey, string> = {
  alchemy: "trade_alchemy",
  herbalism: "spell_nature_naturetouchgrow",
  cooking: "inv_misc_food_15",
  fishing: "trade_fishing",
  "first-aid": "spell_holy_sealofsacrifice",
};

export const professionByKey = new Map<ProfessionKey, Profession>(professions.map((p) => [p.key, p]));

export const recipesByProfession = groupBy(recipes, (recipe) => recipe.profession);

/** Item id to the recipes that use it as a reagent. */
export const recipesUsingItem = new Map<number, Recipe[]>();
recipes.forEach((recipe) => recipe.reagents.forEach(({ item }) => appendTo(recipesUsingItem, item, recipe)));

/** Profession that lists an item as a gatherable, if any (first match). */
export const gathererOf = (itemId: number): Profession | undefined =>
  professions.find((p) => p.gatherables.includes(itemId));

export const itemOf = (id: number): Item => items[String(id)] ?? { name: `Item ${id}`, quality: 1, icon: null };

export const recipeKey = (recipe: Recipe): string => `${recipe.profession}:${recipe.id}`;

/** Zone names where an item's node spawns (most spawns first). Empty for items without known nodes. */
export const locationsOf = (id: number): string[] => locations.items[String(id)] ?? [];

/**
 * What the detail pane shows after "Learned from:": "Trainer", or for a recipe item its sources, e.g.
 * "Recipe (H: Orgrimmar/Quest, A: Darnassus, Drop)", or "Recipe" when none is known.
 */
export const learnedFrom = (recipe: Recipe): string => {
  if (recipe.source === "trainer") {
    return "Trainer";
  }
  const source = locations.recipes[recipeKey(recipe)];
  const parts = source ? [
    ...(["H", "A", "N"] as const).flatMap((side) => (source[side] ? [`${side}: ${source[side].join("/")}`] : [])),
    ...(source.drop ? ["Drop"] : []),
  ] : [];
  return parts.length > 0 ? `Recipe (${parts.join(", ")})` : "Recipe";
};
