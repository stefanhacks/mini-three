import type { Container, FederatedPointerEvent } from "pixi.js";
import { type MotionSample, releaseVelocity } from "../motion";

/** Pointer travel, in px, before a press counts as a swipe or a scroll. */
const AXIS_THRESHOLD = 10;
/** Released past this share of the pane's width, the swipe closes it. */
const CLOSE_SHARE = 0.35;
/** Released moving right at least this fast (px per ms), the swipe closes the pane however short it was. */
const CLOSE_SPEED = 0.5;
const MAX_SAMPLES = 20;

/**
 * Which way a press goes once it moved past the threshold: "x" for a swipe to the right, "y" for anything else
 * (a scroll, or a swipe to the left, which the pane leaves alone), null while still undecided.
 */
export const swipeAxis = (dx: number, dy: number): "x" | "y" | null => {
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= AXIS_THRESHOLD) {
    return null;
  }
  return dx > Math.abs(dy) ? "x" : "y";
};

/** Whether a swipe released at `dx` px, moving at `velocity` px per ms, closes a pane `width` px wide. */
export const swipeCloses = (dx: number, velocity: number, width: number): boolean =>
  dx >= width * CLOSE_SHARE || (velocity >= CLOSE_SPEED && dx > 0);

interface SwipeBackHandlers {
  /** Checked on press: false ignores the press (pane not fully open, a note being edited). */
  enabled: () => boolean;
  /** True when the press already scrolls the pane, which rules out a swipe. */
  scrolling: () => boolean;
  /** Called once, when the press turns into a swipe. */
  claim: () => void;
  /** The pane's offset while the finger drags it, in px, never below 0. */
  move: (dx: number) => void;
  /** On release: close the pane, or put it back. */
  end: (close: boolean) => void;
}

/**
 * Swipe right on `view` to close it: the pane follows the finger and, on release, closes if it went far or fast
 * enough, else springs back. While swiping, `view`'s children ignore the pointer, so the release never taps a link.
 */
export const attachSwipeBack = (view: Container, width: number, handlers: SwipeBackHandlers) => {
  let press: { id: number; x: number; y: number; axis: "x" | "y" | null } | null = null;
  let samples: MotionSample[] = [];

  const offset = (event: FederatedPointerEvent) => {
    if (!press) {
      return { dx: 0, dy: 0 };
    }
    const { a, d } = view.worldTransform;
    return { dx: (event.global.x - press.x) / (a || 1), dy: (event.global.y - press.y) / (d || 1) };
  };

  view.on("pointerdown", (event: FederatedPointerEvent) => {
    if (press || !handlers.enabled()) {
      return;
    }
    press = { id: event.pointerId, x: event.global.x, y: event.global.y, axis: null };
    samples = [];
  });

  view.on("globalpointermove", (event: FederatedPointerEvent) => {
    if (!press || event.pointerId !== press.id || press.axis === "y") {
      return;
    }
    const { dx, dy } = offset(event);
    if (press.axis === null) {
      press.axis = handlers.scrolling() ? "y" : swipeAxis(dx, dy);
      if (press.axis !== "x") {
        return;
      }
      view.interactiveChildren = false;
      handlers.claim();
    }
    const x = Math.max(0, dx);
    samples.push({ time: performance.now(), value: x });
    if (samples.length > MAX_SAMPLES) {
      samples.shift();
    }
    handlers.move(x);
  });

  const release = (event: FederatedPointerEvent) => {
    if (!press || event.pointerId !== press.id) {
      return;
    }
    if (press.axis === "x") {
      const x = Math.max(0, offset(event).dx);
      const now = performance.now();
      samples.push({ time: now, value: x });
      view.interactiveChildren = true;
      handlers.end(swipeCloses(x, releaseVelocity(samples, now), width));
    }
    press = null;
  };
  view.on("pointerup", release);
  view.on("pointerupoutside", release);
};
