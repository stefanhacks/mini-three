import { describe, expect, it } from "vitest";
import { evaluate, formatDuration, resolveDescription } from "./descriptions.mjs";

// A fake client: descriptions, effects by "spell:index", durations in ms and stack counts.
const fake = ({ descriptions, effects = {}, durations = {}, stacks = {} }) => ({
  description: (id) => descriptions[id],
  effect: (id, index) => effects[`${id}:${index}`],
  duration: (id) => durations[id],
  stacks: (id) => stacks[id],
});

const effect = (base, extra = {}) => ({ base, variance: 0, period: 0, radius: 0, ...extra });

describe("formatDuration", () => {
  it("writes durations the way the game does", () => {
    expect([7200000, 3600000, 5400000, 1800000, 90000, 15000, 1500, 0, -1].map(formatDuration))
      .toEqual(["2 hours", "1 hour", "1 hour 30 min", "30 min", "1 min 30 sec", "15 sec", "1.5 sec", null, null]);
  });
});

describe("evaluate", () => {
  it("follows precedence and parentheses, and rejects anything else", () => {
    expect(evaluate("(42/5)*18")).toBeCloseTo(151.2);
    expect(evaluate("2+3*4-(1)")).toBe(13);
    expect(() => evaluate("2;alert(1)")).toThrow();
  });
});

describe("resolveDescription", () => {
  it("shows a varying value as a rounded range and a fixed one as is", () => {
    const spells = fake({
      descriptions: { 1: "Restores $s1 health and $s2 mana." },
      effects: { "1:0": effect(80, { variance: 0.25 }), "1:1": effect(-12) },
    });
    expect(resolveDescription(1, spells)).toEqual({ text: "Restores 70 to 90 health and 12 mana.", unresolved: [] });
  });

  it("totals periodic effects over the duration, 5 sec ticks when the data has no period", () => {
    const spells = fake({
      descriptions: { 1: "Restores $o1 health over $d.  Must remain seated.", 2: "$o1 every $t1 sec" },
      effects: { "1:0": effect(17), "2:0": effect(10, { period: 2000 }) },
      durations: { 1: 18000, 2: 10000 },
    });
    expect(resolveDescription(1, spells).text).toBe("Restores 61 health over 18 sec. Must remain seated.");
    expect(resolveDescription(2, spells).text).toBe("50 every 2 sec");
  });

  it("reads other spells, scaling, arithmetic, radius and stacks", () => {
    const spells = fake({
      descriptions: { 1: "$/10;s1 rage, ${($s2/5)*$d} mana, $9s1 fire in $9a1 yd for $9d, $U doses." },
      effects: { "1:0": effect(600), "1:1": effect(42), "9:0": effect(50, { radius: 5 }) },
      durations: { 1: 18000, 9: 15000 },
      stacks: { 1: 3 },
    });
    expect(resolveDescription(1, spells).text).toBe("60 rage, 151 mana, 50 fire in 5 yd for 15 sec, 3 doses.");
  });

  it("embeds other descriptions in their own context and takes the last branch of conditionals", () => {
    const spells = fake({
      descriptions: {
        1: "$@spelldesc2 Well fed: $s1 Agility. $@spelldesc3",
        2: "Restores $s1 health.",
        3: "$?pc142418[Bonus $s1%.][]",
        4: "Gain $?$PL<12[3]?$PL<24[8][$5s1] Stamina.",
      },
      effects: { "1:0": effect(4), "2:0": effect(61), "3:0": effect(10), "5:0": effect(56) },
    });
    expect(resolveDescription(1, spells).text).toBe("Restores 61 health. Well fed: 4 Agility.");
    expect(resolveDescription(4, spells).text).toBe("Gain 56 Stamina.");
  });

  it("lists what it can't resolve instead of guessing", () => {
    const spells = fake({ descriptions: { 1: "Gain $7s2 skill for $7d and $x1. $@spelldesc404" }, effects: {} });
    expect(resolveDescription(1, spells).unresolved).toEqual(["$7s2", "$7d", "$x1.", "$@spelldesc404"]);
  });
});
