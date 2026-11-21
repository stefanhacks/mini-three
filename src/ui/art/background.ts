import { BlurFilter, Container, Rectangle, type Renderer, Sprite, type Texture } from "pixi.js";
import { type DrawContext, createDrawContext, createRandom, rgba } from "./draw";

/** Size the scenes are drawn at. They are blurred, so a modest size upscales to any screen without looking soft. */
export const BACKGROUND_WIDTH = 1024;
export const BACKGROUND_HEIGHT = 640;
/** Scenes are drawn this far past every edge, so the blur has real pixels to pull in instead of transparency. */
const BLEED = 48;
const BLUR_STRENGTH = 7;
const BLUR_QUALITY = 4;

const W = BACKGROUND_WIDTH;
const H = BACKGROUND_HEIGHT;
const LEFT = -BLEED;
const RIGHT = W + BLEED;
const TOP = -BLEED;
const BOTTOM = H + BLEED;

type Random = () => number;

const sky = (ctx: DrawContext, stops: [number, number][]): void => {
  ctx.g.rect(LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP).fill(ctx.linear(stops));
};

const glow = (ctx: DrawContext, x: number, y: number, r: number, color: number, alpha: number): void => {
  ctx.g.circle(x, y, r).fill(ctx.radial([[0, rgba(color, alpha)], [0.4, rgba(color, alpha * 0.45)],
    [1, rgba(color, 0)]]));
};

const band = (ctx: DrawContext, y: number, height: number, color: number, alpha: number): void => {
  ctx.g.rect(LEFT, y - height / 2, RIGHT - LEFT, height).fill(ctx.linear([[0, rgba(color, 0)],
    [0.5, rgba(color, alpha)], [1, rgba(color, 0)]]));
};

/**
 * Darkens toward the edges with stacked dark sheets, each with a smaller elliptical hole. (A radial
 * `FillGradient` can't do this: Pixi paints its last stop under the whole gradient texture first.)
 */
const vignette = (ctx: DrawContext, strength: number): void => {
  const steps = 12;
  // Holes must stay inside the sheet, or Pixi drops them.
  const maxX = (RIGHT - LEFT) / 2 - 1;
  const maxY = (BOTTOM - TOP) / 2 - 1;
  for (let i = 0; i < steps; i++) {
    const t = 1 - i / steps;
    ctx.g.rect(LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP).fill({ color: 0x000000, alpha: strength / steps })
      .ellipse(W / 2, H / 2, W * 0.4 + (maxX - W * 0.4) * t, H * 0.4 + (maxY - H * 0.4) * t).cut();
  }
};

/**
 * Points along a skyline: a sum of sines with random phases, plus `jag` of ridged noise for sharp peaks.
 */
const ridge = (random: Random, baseY: number, amp: number, jag = 0, step = 6): number[] => {
  const waves = [0.004, 0.009, 0.021, 0.05].map((freq, i) => ({
    freq,
    phase: random() * Math.PI * 2,
    weight: 1 / (i + 1),
  }));
  const total = waves.reduce((sum, w) => sum + w.weight, 0);
  const points: number[] = [];
  for (let x = LEFT; x <= RIGHT; x += step) {
    const smooth = waves.reduce((sum, w) => sum + Math.sin(x * w.freq + w.phase) * w.weight, 0) / total;
    const sharp = 1 - Math.abs(Math.sin(x * 0.011 + waves[0].phase));
    points.push(x, baseY - amp * ((smooth + 1) / 2 * (1 - jag) + sharp * jag));
  }
  return points;
};

const fillBelow = (ctx: DrawContext, points: number[], color: number, alpha = 1): void => {
  ctx.g.poly([...points, RIGHT, BOTTOM, LEFT, BOTTOM]).fill({ color, alpha });
};

const pine = (ctx: DrawContext, x: number, baseY: number, height: number, color: number): void => {
  const tiers = 4;
  const width = height * 0.42;
  for (let i = 0; i < tiers; i++) {
    const tierTop = baseY - height + (height * 0.8 * i) / tiers;
    const tierWidth = width * (0.45 + (0.55 * (i + 1)) / tiers);
    const tierBottom = tierTop + height * 0.38;
    ctx.g.poly([x, tierTop, x + tierWidth / 2, tierBottom, x - tierWidth / 2, tierBottom]);
  }
  ctx.g.rect(x - height * 0.03, baseY - height * 0.25, height * 0.06, height * 0.25).fill(color);
};

const forestLayer = (
  ctx: DrawContext, random: Random, baseY: number, minH: number, maxH: number, gap: number, color: number,
): void => {
  fillBelow(ctx, ridge(random, baseY, 18), color);
  for (let x = LEFT; x < RIGHT; x += gap * (0.5 + random())) {
    pine(ctx, x, baseY + 10, minH + random() * (maxH - minH), color);
  }
};

const stars = (ctx: DrawContext, random: Random, count: number, maxY: number): void => {
  for (let i = 0; i < count; i++) {
    const r = 0.6 + random() ** 3 * 1.6;
    ctx.g.circle(LEFT + random() * (RIGHT - LEFT), TOP + random() * (maxY - TOP), r)
      .fill({ color: 0xf4f1ff, alpha: 0.4 + random() * 0.6 });
  }
};

// The popup covers the middle of the screen, so each scene keeps its focal points (moon, sun, glows) near the
// edges and corners, where they show around the window.

const moonlitForest = (ctx: DrawContext): void => {
  const random = createRandom(11);
  const moon = { x: W * 0.84, y: H * 0.17 };
  sky(ctx, [[0, 0x0a1834], [0.4, 0x22476e], [0.66, 0x6189ab], [0.8, 0x2c4a66], [1, 0x0b1626]]);
  stars(ctx, random, 260, H * 0.5);
  glow(ctx, moon.x, moon.y, 300, 0xb4d4ee, 0.55);
  ctx.g.circle(moon.x, moon.y, 38).fill(0xf6f2dc);
  ctx.g.circle(moon.x - 11, moon.y - 7, 8).circle(moon.x + 13, moon.y + 9, 5).fill({ color: 0xcfcab2, alpha: 0.6 });
  fillBelow(ctx, ridge(random, H * 0.62, 90, 0.4), 0x3a5f80);
  band(ctx, H * 0.62, 100, 0xa9c8de, 0.4);
  forestLayer(ctx, random, H * 0.7, 40, 80, 22, 0x264463);
  band(ctx, H * 0.74, 80, 0x8fb2cc, 0.35);
  forestLayer(ctx, random, H * 0.82, 90, 160, 36, 0x15293f);
  band(ctx, H * 0.86, 70, 0x7ea3bf, 0.22);
  forestLayer(ctx, random, H * 1.02, 220, 380, 80, 0x08121e);
  vignette(ctx, 0.55);
};

const duskCoast = (ctx: DrawContext): void => {
  const random = createRandom(23);
  const horizon = H * 0.62;
  const sun = { x: W * 0.15, y: horizon - 8 };
  sky(ctx, [[0, 0x2a1640], [0.25, 0x6a2f5e], [0.48, 0xc9583f], [0.62, 0xf7b366], [0.63, 0x6a3a58], [1, 0x1a0f24]]);
  glow(ctx, sun.x, sun.y, 380, 0xffb070, 0.7);
  ctx.g.circle(sun.x, sun.y, 30).fill(0xffe6b5);
  for (let i = 0; i < 12; i++) {
    const y = H * (0.08 + random() * 0.4);
    ctx.g.ellipse(LEFT + random() * (RIGHT - LEFT), y, 90 + random() * 160, 6 + random() * 10)
      .fill({ color: y < H * 0.28 ? 0x8a3a6a : 0xf08a5a, alpha: 0.45 + random() * 0.3 });
  }
  // Sea below the horizon, with the sun's reflection broken into ripples.
  ctx.g.rect(LEFT, horizon, RIGHT - LEFT, BOTTOM - horizon).fill(ctx.linear([[0, 0x7a4060], [1, 0x1a0f24]]));
  for (let i = 0; i < 80; i++) {
    const y = horizon + 3 + random() ** 1.6 * (H - horizon);
    const spread = 30 + (y - horizon) * 0.8;
    ctx.g.ellipse(sun.x + (random() - 0.5) * spread, y, 10 + random() * 40, 1.5)
      .fill({ color: 0xffc98a, alpha: 0.6 * (1 - (y - horizon) / (H - horizon)) + 0.1 });
  }
  // The peninsula: a long headland running out to sea from the right.
  const far = ridge(random, horizon, 150, 0.2);
  const headland: number[] = [];
  for (let i = 0; i < far.length; i += 2) {
    const x = far[i];
    const t = Math.min(1, Math.max(0, (x - W * 0.5) / (W * 0.4)));
    headland.push(x, horizon - (horizon - far[i + 1]) * t);
  }
  fillBelow(ctx, headland, 0x3a1d3e);
  band(ctx, horizon + 3, 24, 0xf7b366, 0.3);
  const towerX = W * 0.9;
  const towerBase = headland[Math.round((towerX - LEFT) / 6) * 2 + 1] + 4;
  ctx.g.poly([towerX - 10, towerBase, towerX + 10, towerBase, towerX + 6, towerBase - 70, towerX - 6, towerBase - 70])
    .fill(0x220f28);
  glow(ctx, towerX, towerBase - 74, 50, 0xffd27a, 0.9);
  vignette(ctx, 0.5);
};

const crystal = (ctx: DrawContext, x: number, y: number, h: number, angle: number, color: number): void => {
  const w = h * 0.22;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const pt = (px: number, py: number) => [x + px * cos - py * sin, y + px * sin + py * cos];
  ctx.g.poly([...pt(-w / 2, 0), ...pt(-w / 2, -h * 0.75), ...pt(0, -h), ...pt(w / 2, -h * 0.75), ...pt(w / 2, 0)])
    .fill(color);
  ctx.g.poly([...pt(0, 0), ...pt(0, -h), ...pt(w / 2, -h * 0.75), ...pt(w / 2, 0)])
    .fill({ color: 0xffffff, alpha: 0.3 });
};

const crystalCavern = (ctx: DrawContext): void => {
  const random = createRandom(37);
  sky(ctx, [[0, 0x080a12], [0.5, 0x15202e], [1, 0x090b12]]);
  glow(ctx, W * 0.1, H * 0.62, 420, 0x2fd1c5, 0.6);
  glow(ctx, W * 0.9, H * 0.4, 380, 0x8a4dff, 0.55);
  glow(ctx, W * 0.55, H * 1.0, 300, 0x5fd8ff, 0.35);
  // Back wall layers, hanging from the ceiling and rising from the floor.
  const ceiling = (baseY: number, amp: number, color: number, spikes: number, spikeLen: number) => {
    const points = ridge(random, baseY, -amp, 0.3);
    ctx.g.poly([...points, RIGHT, TOP, LEFT, TOP]).fill(color);
    for (let i = 0; i < spikes; i++) {
      const x = LEFT + random() * (RIGHT - LEFT);
      const len = spikeLen * (0.4 + random());
      const top = baseY - 20;
      ctx.g.poly([x - len * 0.12, top, x + len * 0.12, top, x, top + len]).fill(color);
    }
  };
  const floor = (baseY: number, amp: number, color: number, spikes: number, spikeLen: number) => {
    fillBelow(ctx, ridge(random, baseY, amp, 0.3), color);
    for (let i = 0; i < spikes; i++) {
      const x = LEFT + random() * (RIGHT - LEFT);
      const len = spikeLen * (0.4 + random());
      ctx.g.poly([x - len * 0.15, baseY + 20, x + len * 0.15, baseY + 20, x, baseY + 20 - len]).fill(color);
    }
  };
  ceiling(H * 0.14, 50, 0x1a2636, 14, 120);
  floor(H * 0.8, 60, 0x172231, 10, 110);
  band(ctx, H * 0.72, 120, 0x2fd1c5, 0.15);
  ceiling(H * 0.05, 40, 0x0a0e16, 10, 170);
  const clusters: [number, number, number][] = [[W * 0.1, H * 0.86, 0x37e0d2], [W * 0.9, H * 0.82, 0xa070ff],
    [W * 0.55, H * 0.97, 0x5fd8ff]];
  clusters.forEach(([cx, cy, color]) => {
    glow(ctx, cx, cy - 40, 150, color, 0.6);
    for (let i = 0; i < 8; i++) {
      crystal(ctx, cx + (random() - 0.5) * 90, cy, 50 + random() * 80, (random() - 0.5) * 0.9, color);
    }
  });
  floor(H * 0.96, 24, 0x05070b, 12, 120);
  for (let i = 0; i < 120; i++) {
    ctx.g.circle(LEFT + random() * (RIGHT - LEFT), TOP + random() * (BOTTOM - TOP), 1 + random() * 2)
      .fill({ color: random() > 0.5 ? 0x8ff5ec : 0xc8a8ff, alpha: 0.3 + random() * 0.6 });
  }
  vignette(ctx, 0.6);
};

const mistyPeaks = (ctx: DrawContext): void => {
  const random = createRandom(53);
  sky(ctx, [[0, 0x2a3a60], [0.25, 0x6a80a8], [0.45, 0xe6c3a8], [0.6, 0xb7bfd0], [1, 0x2a3346]]);
  glow(ctx, W * 0.86, H * 0.36, 320, 0xffd9b8, 0.7);
  const layers: [number, number, number, number][] = [
    [H * 0.52, 150, 0x7d8eaa, 0xd8dee8],
    [H * 0.64, 120, 0x56678a, 0xc3ccda],
    [H * 0.78, 90, 0x36435e, 0],
    [H * 0.94, 60, 0x18202f, 0],
  ];
  layers.forEach(([baseY, amp, rock, snow], i) => {
    const points = ridge(random, baseY, amp, 0.65, 5);
    if (snow) {
      fillBelow(ctx, points, snow);
      fillBelow(ctx, points.map((v, j) => (j % 2 === 1 ? v + 14 + i * 6 : v)), rock);
    } else {
      fillBelow(ctx, points, rock);
    }
    band(ctx, baseY + 10, 110, 0xd5dce8, 0.35 - i * 0.07);
  });
  vignette(ctx, 0.5);
};

export const BACKGROUND_VARIANTS = {
  moonlitForest,
  duskCoast,
  crystalCavern,
  mistyPeaks,
} satisfies Record<string, (ctx: DrawContext) => void>;

export type BackgroundVariant = keyof typeof BACKGROUND_VARIANTS;

export const BACKGROUND_NAMES = Object.keys(BACKGROUND_VARIANTS) as BackgroundVariant[];

/** Draws a scene, blurs it once with `BlurFilter`, and bakes the result into a texture. */
export const renderBackground = (renderer: Renderer, variant: BackgroundVariant): Texture => {
  const ctx = createDrawContext();
  BACKGROUND_VARIANTS[variant](ctx);
  const blur = new BlurFilter({ strength: BLUR_STRENGTH, quality: BLUR_QUALITY });
  ctx.g.filters = [blur];
  const root = new Container();
  root.addChild(ctx.g);
  const texture = renderer.generateTexture({
    target: root,
    frame: new Rectangle(0, 0, W, H),
    resolution: 1,
  });
  root.destroy();
  ctx.dispose();
  blur.destroy();
  return texture;
};

export interface Backdrop {
  view: Sprite;
  variant: BackgroundVariant;
  setVariant: (variant: BackgroundVariant) => void;
  /** Switches to the next variant, wrapping around. */
  next: () => BackgroundVariant;
  /** Scales the baked texture to cover the screen. No re-render. */
  resize: (width: number, height: number) => void;
  destroy: () => void;
}

/**
 * A full-screen blurred scene. Each variant is baked the first time it is shown and kept, so cycling back is free.
 */
export const createBackdrop = (renderer: Renderer, initial: BackgroundVariant = "moonlitForest"): Backdrop => {
  const cache = new Map<BackgroundVariant, Texture>();
  const textureFor = (variant: BackgroundVariant): Texture => {
    const cached = cache.get(variant);
    if (cached) {
      return cached;
    }
    const texture = renderBackground(renderer, variant);
    cache.set(variant, texture);
    return texture;
  };

  const view = new Sprite({ texture: textureFor(initial), anchor: 0.5 });
  let size = { width: W, height: H };

  const backdrop: Backdrop = {
    view,
    variant: initial,
    setVariant: (variant) => {
      backdrop.variant = variant;
      view.texture = textureFor(variant);
      backdrop.resize(size.width, size.height);
    },
    next: () => {
      const index = BACKGROUND_NAMES.indexOf(backdrop.variant);
      backdrop.setVariant(BACKGROUND_NAMES[(index + 1) % BACKGROUND_NAMES.length]);
      return backdrop.variant;
    },
    resize: (width, height) => {
      size = { width, height };
      view.scale.set(Math.max(width / W, height / H));
      view.position.set(width / 2, height / 2);
    },
    destroy: () => {
      view.destroy();
      cache.forEach((texture) => texture.destroy(true));
      cache.clear();
    },
  };
  return backdrop;
};
