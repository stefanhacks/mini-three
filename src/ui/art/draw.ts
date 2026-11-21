import { FillGradient, Graphics } from "pixi.js";

/** Radial gradients are soft glows; 128 texels across is plenty and keeps each one at 64 KB. */
const RADIAL_TEXTURE_SIZE = 128;

export type ColorStop = [offset: number, color: string | number];

/**
 * A `Graphics` plus gradient helpers. The texture factory hands one to each draw function and destroys the
 * graphics once the piece is rendered to a texture.
 */
export interface DrawContext {
  g: Graphics;
  /** Linear gradient in local space: vertical (top to bottom) by default, horizontal when `horizontal`. */
  linear: (stops: ColorStop[], horizontal?: boolean) => FillGradient;
  /** Radial gradient centred on the filled shape's bounds. */
  radial: (stops: ColorStop[], center?: { x: number; y: number }, outerRadius?: number) => FillGradient;
}

export const createDrawContext = (): DrawContext & { dispose: () => void } => {
  const g = new Graphics();
  const toStops = (stops: ColorStop[]) => stops.map(([offset, color]) => ({ offset, color }));

  return {
    g,
    linear: (stops, horizontal = false) => new FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 },
      colorStops: toStops(stops),
      textureSpace: "local",
    }),
    radial: (stops, center = { x: 0.5, y: 0.5 }, outerRadius = 0.5) => new FillGradient({
      type: "radial",
      center,
      innerRadius: 0,
      outerCenter: center,
      outerRadius,
      colorStops: toStops(stops),
      textureSpace: "local",
      textureSize: RADIAL_TEXTURE_SIZE,
    }),
    // Gradients are left alive (linear ones are 256x1, radial ones 128x128): Pixi keeps batch bind groups that
    // still reference them, so destroying them right after the bake only produces "destroyed while still bound"
    // warnings.
    dispose: () => {
      g.destroy();
    },
  };
};

/** CSS colour string with alpha, for gradient stops that fade out without darkening. */
export const rgba = (hex: number, alpha: number): string =>
  `rgba(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff}, ${alpha})`;

/** A rectangular ring `t` pixels thick, drawn as four rects so edges land on whole pixels. */
export const ring = (
  g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1, t = 1,
): void => {
  g.rect(x, y, w, t)
    .rect(x, y + h - t, w, t)
    .rect(x, y + t, t, h - 2 * t)
    .rect(x + w - t, y + t, t, h - 2 * t)
    .fill({ color, alpha });
};

/** A 1px ring lit from the top left: `light` on the top and left edges, `dark` on the bottom and right. */
export const bevel = (
  g: Graphics, x: number, y: number, w: number, h: number, light: number, dark: number, alpha = 1,
): void => {
  g.rect(x, y, w - 1, 1).rect(x, y + 1, 1, h - 2).fill({ color: light, alpha });
  g.rect(x + 1, y + h - 1, w - 1, 1).rect(x + w - 1, y, 1, h - 1).fill({ color: dark, alpha });
};

/** Darkens the inside edges of a rect with fading rings, like light falling into a recess. */
export const innerShadow = (
  g: Graphics, x: number, y: number, w: number, h: number, depth: number, strength: number,
): void => {
  for (let i = 0; i < depth; i++) {
    const alpha = strength * (1 - i / depth) ** 2;
    ring(g, x + i, y + i, w - 2 * i, h - 2 * i, 0x000000, alpha);
  }
};

/** Deterministic PRNG (mulberry32), so procedural art is the same on every load. */
export const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
