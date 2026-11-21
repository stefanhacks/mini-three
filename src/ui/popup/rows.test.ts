import { describe, expect, it } from "vitest";
import type { Item, Profession, Recipe } from "../../data";
import { buildRows } from "./rows";

const recipe = (id: number, category: number, yellow: number, name: string): Recipe => ({
  id, name, profession: "mining", category, minSkill: 1, trivialLow: yellow, trivialHigh: yellow + 40, reagents: [],
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

describe("buildRows", () => {
  it("lists gatherables first, sorts sections, and skips empty categories", () => {
    const rows = buildRows(mining, new Set(), sources);
    expect(rows.map((row) => row.kind === "header" ? `# ${row.label}` : row.kind === "item"
      ? names[row.itemId] : row.recipe.name)).toEqual([
      "# Gathered", "Copper Ore", "Tin Ore", "# Smelting", "Smelt Copper", "Smelt Tin",
    ]);
  });

  it("keeps only the header of a collapsed section", () => {
    const rows = buildRows(mining, new Set(["mining:gathered"]), sources);
    expect(rows[0]).toMatchObject({ kind: "header", collapsed: true, count: 2 });
    expect(rows[1]).toMatchObject({ kind: "header", label: "Smelting" });
  });
});
