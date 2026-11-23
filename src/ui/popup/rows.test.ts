import { describe, expect, it } from "vitest";
import type { Item, Profession, Recipe } from "../../data";
import { buildRows } from "./rows";

const recipe = (id: number, category: number, yellow: number, name: string, learn?: number): Recipe => ({
  id, name, profession: "herbalism", category, trivialLow: yellow, trivialHigh: yellow + 40,
  source: "trainer", reagents: [], ...(learn !== undefined ? { learn } : {}),
});

const herbalism: Profession = {
  key: "herbalism",
  tier: "primary",
  name: "Herbalism",
  skillLine: 182,
  categories: [{ id: 1, name: "Smelting" }, { id: 2, name: "Empty" }],
  gatherables: [3, 2],
};

const names: Record<number, string> = { 2: "Tin Ore", 3: "Copper Ore" };
const sources = {
  recipes: [recipe(10, 1, 50, "Smelt Tin"), recipe(11, 1, 1, "Smelt Copper")],
  itemOf: (id: number): Item => ({ name: names[id] ?? "?", quality: 1, icon: null }),
  recipeKey: (r: Recipe) => `herbalism:${r.id}`,
  zonesOf: (id: number): string[] => (id === 3 ? ["Mulgore", "Dun Morogh"] : []),
};

const none = { known: new Set<string>(), knownOnly: false };

describe("buildRows", () => {
  it("lists gatherables first, sorts sections, and skips empty categories", () => {
    const rows = buildRows(herbalism, new Set(), sources, none);
    expect(rows.map((row) => row.kind === "header" ? `# ${row.label}` : row.kind === "item"
      ? names[row.itemId] : row.recipe.name)).toEqual([
      "# Gathered", "Copper Ore", "Tin Ore", "# Smelting", "Smelt Copper", "Smelt Tin",
    ]);
  });

  it("puts the Camping category above the gatherables", () => {
    const camper: Profession = { ...herbalism, categories: [...herbalism.categories, { id: 4, name: "Camping" }] };
    const withTent = { ...sources, recipes: [...sources.recipes, recipe(12, 4, 1, "Tent")] };
    const rows = buildRows(camper, new Set(), withTent, none);
    expect(rows.filter((row) => row.kind === "header").map((row) => row.label))
      .toEqual(["Camping", "Gathered", "Smelting"]);
  });

  it("keeps only the header of a collapsed section", () => {
    const rows = buildRows(herbalism, new Set(["herbalism:gathered"]), sources, none);
    expect(rows[0]).toMatchObject({ kind: "header", collapsed: true, count: 2 });
    expect(rows[1]).toMatchObject({ kind: "header", label: "Smelting" });
  });

  it("marks known recipes, and with knownOnly keeps only those but leaves gatherables alone", () => {
    const known = new Set(["herbalism:10"]);
    const all = buildRows(herbalism, new Set(), sources, { known, knownOnly: false });
    expect(all.filter((row) => row.kind === "recipe").map((row) => row.kind === "recipe" && row.known))
      .toEqual([false, true]);

    const only = buildRows(herbalism, new Set(), sources, { known, knownOnly: true });
    expect(only.map((row) => row.kind === "header" ? `# ${row.label}` : row.kind === "item"
      ? names[row.itemId] : row.recipe.name)).toEqual([
      "# Gathered", "Copper Ore", "Tin Ore", "# Smelting", "Smelt Tin",
    ]);
    // Nothing known: the recipe section disappears entirely.
    expect(buildRows(herbalism, new Set(), sources, { known: new Set(), knownOnly: true }).map((row) => row.kind))
      .toEqual(["header", "item", "item"]);
  });

  it("orders recipes by learnable level, those without one by yellow, then yellow, then name", () => {
    const recipes = [recipe(1, 1, 60, "B", 40), recipe(2, 1, 55, "Unknown"), recipe(3, 1, 45, "A", 40),
      recipe(4, 1, 20, "First", 1)];
    expect(buildRows(herbalism, new Set(), { ...sources, recipes }, none)
      .flatMap((row) => row.kind === "recipe" ? [row.recipe.name] : []))
      .toEqual(["First", "A", "B", "Unknown"]);
  });

  describe("with a query", () => {
    const labels = (rows: ReturnType<typeof buildRows>) => rows.map((row) => row.kind === "header" ? `# ${row.label}`
      : row.kind === "item" ? names[row.itemId] : row.recipe.name);
    // Smelting turns Copper Ore into a bar: the recipes reference ore items by reagent.
    const withReagents = {
      ...sources,
      recipes: [
        { ...recipe(10, 1, 50, "Smelt Tin"), reagents: [{ item: 2, count: 1 }] },
        { ...recipe(11, 1, 1, "Fundição Élfica"), reagents: [{ item: 3, count: 1 }] },
      ],
    };

    it("ignores case and accents, and drops the sections left without matches", () => {
      expect(labels(buildRows(herbalism, new Set(), withReagents, { ...none, query: "FUNDICAO" })))
        .toEqual(["# Smelting", "Fundição Élfica"]);
      expect(labels(buildRows(herbalism, new Set(), withReagents, { ...none, query: "  élfica " })))
        .toEqual(["# Smelting", "Fundição Élfica"]);
      expect(buildRows(herbalism, new Set(), withReagents, { ...none, query: "zzz" })).toEqual([]);
    });

    it("matches a recipe by its reagents, and gatherables by their own name", () => {
      expect(labels(buildRows(herbalism, new Set(), withReagents, { ...none, query: "copper" })))
        .toEqual(["# Gathered", "Copper Ore", "# Smelting", "Fundição Élfica"]);
    });

    it("matches gatherables by the zones they are found in, not recipes by their reagents' zones", () => {
      expect(labels(buildRows(herbalism, new Set(), withReagents, { ...none, query: "mulgore" })))
        .toEqual(["# Gathered", "Copper Ore"]);
    });

    it("shows matches in collapsed sections, and still applies known only", () => {
      const collapsed = new Set(["herbalism:gathered", "herbalism:cat:1"]);
      expect(labels(buildRows(herbalism, collapsed, withReagents, { ...none, query: "ore" })))
        .toEqual(["# Gathered", "Copper Ore", "Tin Ore", "# Smelting", "Fundição Élfica", "Smelt Tin"]);
      const known = new Set(["herbalism:10"]);
      expect(labels(buildRows(herbalism, collapsed, withReagents, { known, knownOnly: true, query: "ore" })))
        .toEqual(["# Gathered", "Copper Ore", "Tin Ore", "# Smelting", "Smelt Tin"]);
      // A blank query is no query: the collapsed state holds.
      expect(buildRows(herbalism, collapsed, withReagents, { ...none, query: "  " })
        .every((row) => row.kind === "header"))
        .toBe(true);
    });
  });
});
