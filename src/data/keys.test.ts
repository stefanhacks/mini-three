import { describe, expect, it } from "vitest";
import { professions } from ".";
import { PROFESSION_KEYS } from "./keys";

describe("PROFESSION_KEYS", () => {
  it("is the generated data's professions, in the same order", () => {
    expect(professions.map((profession) => profession.key)).toEqual([...PROFESSION_KEYS]);
  });
});
