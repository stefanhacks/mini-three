import { CLOTH_KEY, type Item, type Profession, type Recipe } from "../../data";

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
}

interface KnownFilter {
  known: ReadonlySet<string>;
  /** Hide recipes that are not known. Gatherables are never filtered. */
  knownOnly: boolean;
}

/**
 * Flattens a profession into list rows: its gatherables first (one section), then its recipes by category in the
 * game's category order, each by the skill where it turns yellow. Empty sections are skipped; collapsed sections
 * keep their header only. With `knownOnly`, recipes that are not known are left out (and so are sections left empty).
 */
export const buildRows = (
  profession: Profession, collapsed: ReadonlySet<string>, sources: RowSources, filter: KnownFilter,
): ListRow[] => {
  const rows: ListRow[] = [];
  const section = (id: string, label: string, children: ListRow[]) => {
    if (children.length === 0) {
      return;
    }
    const isCollapsed = collapsed.has(id);
    rows.push({ kind: "header", id, label, count: children.length, collapsed: isCollapsed });
    if (!isCollapsed) {
      rows.push(...children);
    }
  };

  const gathered = [...profession.gatherables]
    .sort((a, b) => sources.itemOf(a).name.localeCompare(sources.itemOf(b).name))
    .map((itemId): ListRow => ({ kind: "item", key: `item:${itemId}`, itemId }));
  section(`${profession.key}:gathered`, profession.key === CLOTH_KEY ? "Cloth" : "Gathered", gathered);

  const byCategory = new Map<number, Recipe[]>();
  sources.recipes.forEach((recipe) => {
    const list = byCategory.get(recipe.category) ?? [];
    list.push(recipe);
    byCategory.set(recipe.category, list);
  });
  profession.categories.forEach((category) => {
    const list = (byCategory.get(category.id) ?? [])
      .filter((recipe) => !filter.knownOnly || filter.known.has(sources.recipeKey(recipe)))
      .sort((a, b) => a.trivialLow - b.trivialLow || a.name.localeCompare(b.name));
    section(`${profession.key}:cat:${category.id}`, category.name,
      list.map((recipe): ListRow => {
        const key = sources.recipeKey(recipe);
        return { kind: "recipe", key, recipe, known: filter.known.has(key) };
      }));
  });
  return rows;
};
