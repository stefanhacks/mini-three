import { describe, expect, it } from "vitest";
import { type SavedData, emptySaved, parse, serialize } from "./storage";

const valid = new Set(["alchemy", "herbalism", "cooking"]);

const saved: SavedData = {
  active: "herbalism",
  collapsed: ["herbalism:gathered"],
  known: ["alchemy:101", "herbalism:7"],
  knownOnly: true,
  notes: { "alchemy:101": "buy vials", "item:2770": "Elwynn mines" },
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
      known: ["alchemy:1", "basketweaving:2", "nonsense", 9],
      knownOnly: "yes",
      notes: {
        "alchemy:1": "ok", "basketweaving:2": "gone", "item:5": "kept", "item:x": "bad", "herbalism:3": 4,
        "cooking:9": "",
      },
    });
    expect(parse(raw, valid)).toEqual({
      active: "alchemy",
      collapsed: ["a"],
      known: ["alchemy:1"],
      knownOnly: false,
      notes: { "alchemy:1": "ok", "item:5": "kept" },
    });
  });

  it("reads saves from the profession picker days: drops the choice, keeps the five professions' notes", () => {
    const raw = JSON.stringify({
      version: 1,
      chosen: ["mining", "herbalism"],
      active: "mining",
      collapsed: [],
      known: ["mining:2657", "herbalism:7"],
      knownOnly: false,
      notes: { "mining:2657": "smelt", "herbalism:7": "keep", "item:2770": "kept too" },
    });
    expect(parse(raw, valid)).toEqual({
      active: "alchemy",
      collapsed: [],
      known: ["herbalism:7"],
      knownOnly: false,
      notes: { "herbalism:7": "keep", "item:2770": "kept too" },
    });
  });

  it("caps note length", () => {
    const raw = JSON.stringify({ ...saved, version: 1, notes: { "item:1": "x".repeat(5000) } });
    expect(parse(raw, valid).notes["item:1"]).toHaveLength(1000);
  });
});
