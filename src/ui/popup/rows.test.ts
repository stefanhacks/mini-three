import { describe, expect, it } from "vitest";
import type { Item, Profession, Recipe } from "../../data";
import { buildRows } from "./rows";

const recipe = (id: number, category: number, yellow: number, name: string): Recipe => ({
  id, name, profession: "mining", category, minSkill: 1, trivialLow: yellow, trivialHigh: yellow + 40,
  source: "trainer", reagents: [],
});

const mining: Profession = {
  key: "mining",
  name: "Mining",
  skillLine: 186,
  categories: [{ id: 1, name: "Smelting" }, { id: 2, name: "Empty" }],
  gatherables: [3, 2],
};

const names: Record<number, string> = { 2: "Tin Ore", 3: "Copper Ore" };
const sources = {
  recipes: [recipe(10, 1, 50, "Smelt Tin"), recipe(11, 1, 1, "Smelt Copper")],
  itemOf: (id: number): Item => ({ name: names[id] ?? "?", quality: 1, icon: null }),
  recipeKey: (r: Recipe) => `mining:${r.id}`,
};

const none = { known: new Set<string>(), knownOnly: false };

describe("buildRows", () => {
  it("lists gatherables first, sorts sections, and skips empty categories", () => {
    const rows = buildRows(mining, new Set(), sources, none);
    expect(rows.map((row) => row.kind === "header" ? `# ${row.label}` : row.kind === "item"
      ? names[row.itemId] : row.recipe.name)).toEqual([
      "# Gathered", "Copper Ore", "Tin Ore", "# Smelting", "Smelt Copper", "Smelt Tin",
    ]);
  });

  it("keeps only the header of a collapsed section", () => {
    const rows = buildRows(mining, new Set(["mining:gathered"]), sources, none);
    expect(rows[0]).toMatchObject({ kind: "header", collapsed: true, count: 2 });
    expect(rows[1]).toMatchObject({ kind: "header", label: "Smelting" });
  });

  it("marks known recipes, and with knownOnly keeps only those but leaves gatherables alone", () => {
    const known = new Set(["mining:10"]);
    const all = buildRows(mining, new Set(), sources, { known, knownOnly: false });
    expect(all.filter((row) => row.kind === "recipe").map((row) => row.kind === "recipe" && row.known))
      .toEqual([false, true]);

    const only = buildRows(mining, new Set(), sources, { known, knownOnly: true });
    expect(only.map((row) => row.kind === "header" ? `# ${row.label}` : row.kind === "item"
      ? names[row.itemId] : row.recipe.name)).toEqual([
      "# Gathered", "Copper Ore", "Tin Ore", "# Smelting", "Smelt Tin",
    ]);
    // Nothing known: the recipe section disappears entirely.
    expect(buildRows(mining, new Set(), sources, { known: new Set(), knownOnly: true }).map((row) => row.kind))
      .toEqual(["header", "item", "item"]);
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
      expect(labels(buildRows(mining, new Set(), withReagents, { ...none, query: "FUNDICAO" })))
        .toEqual(["# Smelting", "Fundição Élfica"]);
      expect(labels(buildRows(mining, new Set(), withReagents, { ...none, query: "  élfica " })))
        .toEqual(["# Smelting", "Fundição Élfica"]);
      expect(buildRows(mining, new Set(), withReagents, { ...none, query: "zzz" })).toEqual([]);
    });

    it("matches a recipe by its reagents, and gatherables by their own name", () => {
      expect(labels(buildRows(mining, new Set(), withReagents, { ...none, query: "copper" })))
        .toEqual(["# Gathered", "Copper Ore", "# Smelting", "Fundição Élfica"]);
    });

    it("shows matches in collapsed sections, and still applies known only", () => {
      const collapsed = new Set(["mining:gathered", "mining:cat:1"]);
      expect(labels(buildRows(mining, collapsed, withReagents, { ...none, query: "ore" })))
        .toEqual(["# Gathered", "Copper Ore", "Tin Ore", "# Smelting", "Fundição Élfica", "Smelt Tin"]);
      const known = new Set(["mining:10"]);
      expect(labels(buildRows(mining, collapsed, withReagents, { known, knownOnly: true, query: "ore" })))
        .toEqual(["# Gathered", "Copper Ore", "Tin Ore", "# Smelting", "Smelt Tin"]);
      // A blank query is no query: the collapsed state holds.
      expect(buildRows(mining, collapsed, withReagents, { ...none, query: "  " }).every((row) => row.kind === "header"))
        .toBe(true);
    });
  });
});
