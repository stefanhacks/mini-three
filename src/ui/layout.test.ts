import { describe, expect, it } from "vitest";
import { keyboardShift, layoutMode, stripLayout } from "./layout";

const footprint = { width: 782, height: 596 };

describe("layoutMode", () => {
  it.each([
    ["desktop 1280x800", 1280, 800, "desktop"],
    ["iPad portrait 768x1024", 768, 1024, "desktop"],
    ["iPhone 13 portrait 390x664", 390, 664, "mobile"],
    ["iPhone 13 landscape 750x342", 750, 342, "mobile"],
    ["Pixel 7 landscape 863x360", 863, 360, "mobile"],
    ["a narrow desktop window 640x900", 640, 900, "mobile"],
  ])("%s is %s", (_name, width, height, mode) => {
    expect(layoutMode(width, height, footprint)).toBe(mode);
  });

  it("switches where the desktop window would drop below 80 %", () => {
    expect(layoutMode(650, 800, footprint)).toBe("desktop");
    expect(layoutMode(649, 800, footprint)).toBe("mobile");
  });
});

describe("stripLayout", () => {
  it("keeps one full-size row while the tabs fit", () => {
    expect(stripLayout(5, 354, 54, 44)).toEqual({ perRow: 5, rows: 1, cell: 54 });
  });

  it("shrinks one row a little before wrapping (landscape phones are short)", () => {
    expect(stripLayout(14, 714, 54, 44)).toEqual({ perRow: 14, rows: 1, cell: 51 });
  });

  it.each([[14, 354], [14, 296], [9, 354], [8, 330]])("fits %i tabs in %i px in at most two rows", (count, width) => {
    const { perRow, rows, cell } = stripLayout(count, width, 54, 44);
    expect(rows).toBeLessThanOrEqual(2);
    expect(perRow * rows).toBeGreaterThanOrEqual(count);
    expect(perRow * cell).toBeLessThanOrEqual(width);
  });
});

describe("keyboardShift", () => {
  it("leaves the content alone when the field is visible", () => {
    expect(keyboardShift(500, 580, 0, 664, 8)).toBe(0);
    // iOS already panned the visual viewport down to the field.
    expect(keyboardShift(500, 580, 260, 600, 8)).toBe(0);
  });

  it("lifts the field above the keyboard", () => {
    expect(keyboardShift(500, 580, 0, 400, 8)).toBe(188);
  });

  it("keeps the field's top visible when the band is shorter than the field", () => {
    expect(keyboardShift(200, 400, 0, 120, 8)).toBe(192);
  });
});
