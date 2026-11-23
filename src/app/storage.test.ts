import { describe, expect, it } from "vitest";
import { type SavedData, emptySaved, parse, serialize } from "./storage";

const valid = new Set(["alchemy", "herbalism", "cooking"]);

const saved: SavedData = {
  active: "herbalism",
  collapsed: ["herbalism:gathered"],
  knownOnly: ["alchemy"],
};

describe("saved state", () => {
  it("round-trips through serialize and parse", () => {
    expect(parse(serialize(saved), valid)).toEqual(saved);
  });

  it.each([
    ["nothing saved", null],
    ["corrupt JSON", "{not json"],
    ["a non-object", "[1,2]"],
    ["another version", JSON.stringify({ ...saved, version: 2 })],
    ["no version", JSON.stringify(saved)],
  ])("starts clean on %s", (_name, raw) => {
    expect(parse(raw, valid)).toEqual(emptySaved());
  });

  it("drops unknown professions and wrong types but keeps the rest", () => {
    const raw = JSON.stringify({
      version: 1,
      active: "basketweaving",
      collapsed: ["a", 3],
      knownOnly: ["cooking", "basketweaving", 3, "cooking"],
    });
    expect(parse(raw, valid)).toEqual({ active: "alchemy", collapsed: ["a"], knownOnly: ["cooking"] });
  });

  it("ignores what older saves held: notes, Known flags and the profession picker's choice", () => {
    const raw = JSON.stringify({
      version: 1,
      chosen: ["mining", "herbalism"],
      active: "herbalism",
      collapsed: [],
      known: ["herbalism:7"],
      knownOnly: [],
      notes: { "herbalism:7": "keep", "item:2770": "kept too" },
    });
    expect(parse(raw, valid)).toEqual({ active: "herbalism", collapsed: [], knownOnly: [] });
    expect(JSON.parse(serialize(parse(raw, valid)))).not.toHaveProperty("notes");
  });

  it("reads the old shared Known only as on for the saved active profession only", () => {
    expect(parse(JSON.stringify({ ...saved, version: 1, knownOnly: true }), valid).knownOnly).toEqual(["herbalism"]);
    expect(parse(JSON.stringify({ ...saved, version: 1, knownOnly: false }), valid).knownOnly).toEqual([]);
  });
});
