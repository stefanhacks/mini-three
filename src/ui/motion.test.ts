import { describe, expect, it } from "vitest";
import { MOMENTUM_TAU, flingStep, releaseVelocity, tweenAt } from "./motion";

describe("tweenAt", () => {
  it("starts at from, ends at to, and stays there past the duration", () => {
    expect(tweenAt(300, 0, 0, 250)).toBe(300);
    expect(tweenAt(300, 0, 250, 250)).toBe(0);
    expect(tweenAt(300, 0, 400, 250)).toBe(0);
  });

  it("eases out: more than half the way at the halfway time", () => {
    expect(tweenAt(0, 100, 125, 250)).toBeGreaterThan(50);
  });
});

describe("releaseVelocity", () => {
  it("measures the last 100 ms only", () => {
    const samples = [
      { time: 0, value: 0 }, { time: 400, value: 0 }, { time: 450, value: 50 }, { time: 500, value: 100 },
    ];
    expect(releaseVelocity(samples, 500)).toBe(1);
  });

  it("is zero when the finger stopped before lifting", () => {
    const samples = [{ time: 0, value: 0 }, { time: 50, value: 100 }, { time: 300, value: 100 }];
    expect(releaseVelocity(samples, 300)).toBe(0);
  });
});

describe("flingStep", () => {
  it("covers the same distance at any frame rate", () => {
    const once = flingStep(2, 32);
    const first = flingStep(2, 16);
    const second = flingStep(first.velocity, 16);
    expect(first.distance + second.distance).toBeCloseTo(once.distance, 9);
    expect(second.velocity).toBeCloseTo(once.velocity, 9);
  });

  it("slows down, travels about velocity x tau in total, then stops", () => {
    let velocity = 2;
    let travelled = 0;
    let frames = 0;
    while (velocity !== 0 && frames < 1000) {
      const step = flingStep(velocity, 16);
      travelled += step.distance;
      velocity = step.velocity;
      frames += 1;
    }
    expect(frames).toBeLessThan(200);
    expect(travelled).toBeGreaterThan(2 * MOMENTUM_TAU * 0.98);
    expect(travelled).toBeLessThanOrEqual(2 * MOMENTUM_TAU);
  });
});
