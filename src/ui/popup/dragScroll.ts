import { Container, type FederatedPointerEvent, type FederatedWheelEvent, Rectangle, type Ticker } from "pixi.js";
import { MIN_FLING_SPEED, type MotionSample, flingStep, releaseVelocity } from "../motion";

export interface DragScroll {
  /**
   * Starts a drag from a `pointerdown`. `perPixel` maps pointer pixels to scroll units: -1 drags the content
   * (and flings it on release), a positive factor drags a scrollbar thumb (no fling).
   */
  press: (event: FederatedPointerEvent, perPixel?: number) => void;
  /** True from the moment the current press moved past the threshold, or caught a fling, until the next press. */
  dragged: () => boolean;
  /** Stops a running fling (the wheel calls this). */
  stop: () => void;
  /** Drops the current press without scrolling further or flinging, e.g. when another gesture claims it. */
  cancel: () => void;
}

interface Scroll {
  get: () => number;
  /** Sets the offset; the owner clamps and redraws. */
  set: (value: number) => void;
}

const MOUSE_THRESHOLD = 4;
// Fingers wobble more than a mouse: a tap that moves a few pixels is still a tap.
const TOUCH_THRESHOLD = 8;
const MAX_SAMPLES = 20;
/** Pixels per wheel line, for wheels that report lines (`deltaMode` 1) instead of pixels. */
const WHEEL_LINE = 20;

/**
 * Drag-to-scroll with momentum for `view`. A release while moving flings the content, slowing down exponentially
 * (driven by `ticker`, which only has a listener while a fling runs); a press during a fling stops it without
 * counting as a tap. With `content`, its children ignore the pointer while a drag is on, so a drag that ends on a
 * button never presses it.
 */
export const createDragScroll = (view: Container, ticker: Ticker, scroll: Scroll, content?: Container):
  DragScroll => {
  let drag: { startY: number; startScroll: number; perPixel: number; threshold: number } | null = null;
  let dragged = false;
  let samples: MotionSample[] = [];
  let velocity = 0;

  const tick = (t: Ticker) => {
    if (view.destroyed) {
      stop();
      return;
    }
    const step = flingStep(velocity, t.deltaMS);
    const before = scroll.get();
    scroll.set(before + step.distance);
    // Reaching either end stops the fling (there is no bounce).
    velocity = scroll.get() === before ? 0 : step.velocity;
    if (velocity === 0) {
      stop();
    }
  };

  const stop = () => {
    velocity = 0;
    ticker.remove(tick);
  };

  const setDragged = (value: boolean) => {
    dragged = value;
    if (content) {
      content.interactiveChildren = !value;
    }
  };

  view.on("globalpointermove", (event: FederatedPointerEvent) => {
    if (!drag) {
      return;
    }
    const scale = view.worldTransform.d || 1;
    const dy = (event.global.y - drag.startY) / scale;
    if (!dragged && Math.abs(dy) > drag.threshold) {
      setDragged(true);
    }
    if (dragged) {
      scroll.set(drag.startScroll + dy * drag.perPixel);
      samples.push({ time: performance.now(), value: scroll.get() });
      if (samples.length > MAX_SAMPLES) {
        samples.shift();
      }
    }
  });

  const release = () => {
    if (drag && drag.perPixel < 0 && dragged) {
      const now = performance.now();
      samples.push({ time: now, value: scroll.get() });
      const speed = releaseVelocity(samples, now);
      if (Math.abs(speed) >= MIN_FLING_SPEED) {
        velocity = speed;
        ticker.add(tick);
      }
    }
    drag = null;
    if (content) {
      content.interactiveChildren = true;
    }
  };
  view.on("pointerup", release);
  view.on("pointerupoutside", release);

  return {
    press: (event, perPixel = -1) => {
      const caught = velocity !== 0;
      stop();
      setDragged(caught);
      drag = {
        startY: event.global.y,
        startScroll: scroll.get(),
        perPixel,
        threshold: event.pointerType === "mouse" ? MOUSE_THRESHOLD : TOUCH_THRESHOLD,
      };
      samples = [{ time: performance.now(), value: scroll.get() }];
    },
    dragged: () => dragged,
    stop,
    cancel: () => {
      stop();
      drag = null;
      setDragged(false);
    },
  };
};

/**
 * Scroll input for a pane: the wheel anywhere on `view`, and drags that start on the pane's empty `area` (a hit box
 * added under `content`) or on `content` itself. `scrollBy` moves the offset by a delta in px.
 */
export const attachScrollInput = (
  view: Container, content: Container, area: Rectangle, drag: DragScroll, scrollBy: (delta: number) => void,
) => {
  const hitBox = new Container();
  hitBox.hitArea = area;
  hitBox.eventMode = "static";
  // Above the pane's background and stone overlay, under its content.
  view.addChildAt(hitBox, 2);
  view.eventMode = "static";
  view.on("wheel", (event: FederatedWheelEvent) => {
    drag.stop();
    scrollBy(event.deltaMode === 1 ? event.deltaY * WHEEL_LINE : event.deltaY);
  });
  content.eventMode = "static";
  [hitBox, content].forEach((target) => target.on("pointerdown", (event: FederatedPointerEvent) => drag.press(event)));
};
