import { groupBy } from "../../collections";
import type { Item, Profession, Recipe } from "../../data";
import { itemKey } from "../../data/keys";

export type ListRow =
  | { kind: "header"; id: string; label: string; count: number; collapsed: boolean }
  | { kind: "recipe"; key: string; recipe: Recipe; known: boolean }
  | { kind: "item"; key: string; itemId: number };

/** Heights in the list, in CSS px: a section header's slot, an entry row, and the gap closing a section. */
export interface RowMetrics {
  header: number;
  row: number;
  gap: number;
}

export const DESKTOP_ROWS: RowMetrics = { header: 26, row: 20, gap: 6 };
/** Mobile rows are finger-sized: 34 px targets instead of 20. */
export const TOUCH_ROWS: RowMetrics = { header: 36, row: 34, gap: 8 };

export const rowHeight = (row: ListRow, next: ListRow | undefined, metrics: RowMetrics): number => {
  if (row.kind === "header") {
    return metrics.header;
  }
  return metrics.row + (next?.kind === "header" ? metrics.gap : 0);
};

interface RowSources {
  recipes: Recipe[];
  itemOf: (id: number) => Item;
  recipeKey: (recipe: Recipe) => string;
  /** Zones a gatherable is found in (herb nodes, fishing); search matches them too. */
  zonesOf: (id: number) => string[];
}

interface RowFilter {
  known: ReadonlySet<string>;
  /** Hide recipes that are not known. Gatherables are never filtered by this. */
  knownOnly: boolean;
  /** What the search field holds. Blank (or left out) means no search. */
  query?: string;
}

/** The category that leads every profession's list, above even its gatherables. */
const CAMPING = "Camping";

/** Lowercase with accents removed ("Élixir" and "elixir" compare equal), for the search match. */
export const normalize = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Flattens a profession into list rows: its Camping category first, then its gatherables (one section), then the rest
 * of its recipes by category in the game's category order, each by the skill it is learnable at (recipes with no known level by their yellow skill
 * instead), then yellow skill, then name. Empty sections are skipped; collapsed sections keep their header only.
 * With `knownOnly`, recipes that are not known are left out (and so are sections left empty). With a `query`, only
 * entries whose name contains it stay (a recipe also when one of its reagents does, a gatherable also when one of its
 * zones does: "Mulgore" finds Peacebloom), and collapsed sections open up so every match shows.
 */
export const buildRows = (
  profession: Profession, collapsed: ReadonlySet<string>, sources: RowSources, filter: RowFilter,
): ListRow[] => {
  const rows: ListRow[] = [];
  const query = normalize((filter.query ?? "").trim());
  const searching = query !== "";
  const matches = (name: string) => normalize(name).includes(query);
  const section = (id: string, label: string, children: ListRow[]) => {
    if (children.length === 0) {
      return;
    }
    const isCollapsed = !searching && collapsed.has(id);
    rows.push({ kind: "header", id, label, count: children.length, collapsed: isCollapsed });
    if (!isCollapsed) {
      rows.push(...children);
    }
  };

  const byCategory = groupBy(sources.recipes, (recipe) => recipe.category);
  const categorySection = (category: Profession["categories"][number]) => {
    const list = (byCategory.get(category.id) ?? [])
      .filter((recipe) => !filter.knownOnly || filter.known.has(sources.recipeKey(recipe)))
      .filter((recipe) => !searching || matches(recipe.name)
        || recipe.reagents.some(({ item }) => matches(sources.itemOf(item).name)))
      .sort((a, b) => (a.learn ?? a.trivialLow) - (b.learn ?? b.trivialLow) || a.trivialLow - b.trivialLow
        || a.name.localeCompare(b.name));
    section(`${profession.key}:cat:${category.id}`, category.name,
      list.map((recipe): ListRow => {
        const key = sources.recipeKey(recipe);
        return { kind: "recipe", key, recipe, known: filter.known.has(key) };
      }));
  };
  // Camping is its own category id in each profession, so it is matched by name.
  const isCamping = (category: Profession["categories"][number]) => category.name === CAMPING;

  profession.categories.filter(isCamping).forEach(categorySection);

  const gathered = profession.gatherables
    .filter((itemId) => !searching || matches(sources.itemOf(itemId).name) || sources.zonesOf(itemId).some(matches))
    .sort((a, b) => sources.itemOf(a).name.localeCompare(sources.itemOf(b).name))
    .map((itemId): ListRow => ({ kind: "item", key: itemKey(itemId), itemId }));
  section(`${profession.key}:gathered`, "Gathered", gathered);

  profession.categories.filter((category) => !isCamping(category)).forEach(categorySection);
  return rows;
};
