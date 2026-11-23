import { describe, expect, it } from "vitest";
import { swipeAxis, swipeCloses } from "./swipeBack";

describe("swipeAxis", () => {
  it("stays undecided within the threshold, a tap's wobble", () => {
    expect(swipeAxis(8, -6)).toBeNull();
  });

  it("claims a mostly rightward move as a swipe", () => {
    expect(swipeAxis(20, 12)).toBe("x");
  });

  it("leaves vertical, diagonal and leftward moves to the scroll", () => {
    expect(swipeAxis(5, 20)).toBe("y");
    expect(swipeAxis(15, -15)).toBe("y");
    expect(swipeAxis(-30, 0)).toBe("y");
  });
});

describe("swipeCloses", () => {
  it("closes past 35% of the width, even released at rest", () => {
    expect(swipeCloses(140, 0, 400)).toBe(true);
    expect(swipeCloses(100, 0, 400)).toBe(false);
  });

  it("closes a short fast flick to the right, but not a flick back to the left", () => {
    expect(swipeCloses(40, 0.8, 400)).toBe(true);
    expect(swipeCloses(40, -0.8, 400)).toBe(false);
    expect(swipeCloses(0, 0.8, 400)).toBe(false);
  });
});
