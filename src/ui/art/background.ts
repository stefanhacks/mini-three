import { BlurFilter, Container, type FillGradient, Rectangle, type Renderer, Sprite, type Texture } from "pixi.js";
import { type BackgroundVariant, DEFAULT_BACKGROUND, nextBackground } from "./backgroundNames";
import { type DrawContext, createDrawContext, createRandom, rgba } from "./draw";

export * from "./backgroundNames";

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

/** Maps points from a frame at `(x, y)` turned by `angle` into scene space. */
const rotator = (x: number, y: number, angle: number) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (px: number, py: number): [number, number] => [x + px * cos - py * sin, y + px * sin + py * cos];
};

/** Height of a `ridge` drawn with the default step at `x`. */
const ridgeAt = (points: number[], x: number): number =>
  points[Math.min(points.length / 2 - 1, Math.max(0, Math.round((x - LEFT) / 6))) * 2 + 1];

/** Small specks scattered over a horizontal strip: embers, pollen, sand. */
const motes = (
  ctx: DrawContext, random: Random, count: number, top: number, bottom: number, colors: number[], maxR: number,
): void => {
  for (let i = 0; i < count; i++) {
    ctx.g.circle(LEFT + random() * (RIGHT - LEFT), top + random() * (bottom - top), 0.6 + random() ** 2 * maxR)
      .fill({ color: colors[Math.floor(random() * colors.length)], alpha: 0.3 + random() * 0.6 });
  }
};

/** Thin light shafts fanning out from `(x, y)` between the angles `from` and `to`. */
const rays = (
  ctx: DrawContext, x: number, y: number, from: number, to: number, count: number, length: number, color: number,
  alpha: number,
): void => {
  const spread = 0.025;
  for (let i = 0; i < count; i++) {
    const a = from + ((to - from) * (i + 0.5)) / count;
    ctx.g.poly([x, y, x + Math.cos(a - spread) * length, y + Math.sin(a - spread) * length,
      x + Math.cos(a + spread) * length, y + Math.sin(a + spread) * length]).fill({ color, alpha });
  }
};

/** A pointed leaf from its stem at `(x, y)`, sagging by `droop` (a fraction of its length) toward the tip. */
const leaf = (
  ctx: DrawContext, x: number, y: number, length: number, angle: number, color: number, droop = 0,
): void => {
  const pt = rotator(x, y, angle);
  const upper: number[] = [];
  const lower: number[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const half = length * 0.16 * Math.sin(Math.PI * t);
    const sag = droop * length * t * t;
    const [ux, uy] = pt(t * length, -half);
    const [lx, ly] = pt(t * length, half);
    upper.push(ux, uy + sag);
    lower.unshift(lx, ly + sag);
  }
  ctx.g.poly([...upper, ...lower]).fill(color);
};

const palm = (ctx: DrawContext, random: Random, x: number, baseY: number, height: number, color: number): void => {
  const lean = (random() - 0.5) * height * 0.4;
  const top = { x: x + lean, y: baseY - height };
  ctx.g.moveTo(x, baseY).quadraticCurveTo(x + lean * 0.2, baseY - height * 0.5, top.x, top.y)
    .stroke({ width: Math.max(2, height * 0.05), color });
  for (let i = 0; i < 7; i++) {
    const angle = -Math.PI + 0.2 + (i / 6) * (Math.PI - 0.4) + (random() - 0.5) * 0.2;
    leaf(ctx, top.x, top.y, height * (0.45 + random() * 0.2), angle, color, 0.35);
  }
};

/** A stepped temple, lit from the right. */
const ziggurat = (
  ctx: DrawContext, x: number, baseY: number, width: number, tiers: number, tierH: number, color: number,
  lit: number, dark: number,
): void => {
  for (let i = 0; i < tiers; i++) {
    const w = width * (1 - i / (tiers + 1));
    const y = baseY - tierH * (i + 1);
    ctx.g.rect(x - w / 2, y, w, tierH).fill(color);
    ctx.g.rect(x + w / 2 - w * 0.2, y, w * 0.2, tierH).rect(x - w / 2, y, w, 2).fill(lit);
  }
  const stairTop = baseY - tierH * tiers;
  ctx.g.poly([x - width * 0.08, baseY, x + width * 0.08, baseY, x + width * 0.04, stairTop, x - width * 0.04, stairTop])
    .fill(dark);
  for (let y = stairTop + 4; y < baseY; y += 5) {
    ctx.g.rect(x - width * 0.06, y, width * 0.12, 1).fill({ color: lit, alpha: 0.5 });
  }
  const shrineW = width * 0.18;
  ctx.g.rect(x - shrineW / 2, stairTop - tierH * 1.4, shrineW, tierH * 1.4).fill(color);
  ctx.g.rect(x - shrineW * 0.15, stairTop - tierH * 0.9, shrineW * 0.3, tierH * 0.9).fill(dark);
};

/** Sand over `points`, with a bright crest that is wider where the slope faces the sun on the right. */
const dune = (ctx: DrawContext, points: number[], crest: number, body: number, depth: number): void => {
  fillBelow(ctx, points, crest);
  fillBelow(ctx, points.map((v, i) => {
    if (i % 2 === 0) {
      return v;
    }
    const rise = ((points[i - 2] ?? v) - (points[i + 2] ?? v)) / 12;
    return v + depth * Math.min(2, Math.max(0.2, 0.4 + rise * 4));
  }), body);
};

const tent = (ctx: DrawContext, x: number, baseY: number, h: number, color: number, stripe: number): void => {
  const w = h * 0.7;
  ctx.g.moveTo(x - h * 0.1, baseY - h * 1.15).lineTo(x + h * 0.05, baseY - h * 0.8)
    .moveTo(x + h * 0.1, baseY - h * 1.12).lineTo(x - h * 0.04, baseY - h * 0.8)
    .stroke({ width: 2, color: 0x6a4a2a });
  ctx.g.poly([x - w / 2, baseY, x, baseY - h, x + w / 2, baseY]).fill(color);
  const bandAt = (f: number) => [x - (w / 2) * (1 - f), baseY - h * f, x + (w / 2) * (1 - f), baseY - h * f];
  const [ax, ay, bx, by] = bandAt(0.5);
  const [cx, cy, dx, dy] = bandAt(0.58);
  ctx.g.poly([ax, ay, bx, by, dx, dy, cx, cy]).fill(stripe);
  ctx.g.poly([x, baseY - h, x + w / 2, baseY, x + w * 0.1, baseY]).fill({ color: 0x000000, alpha: 0.18 });
  ctx.g.poly([x - w * 0.08, baseY, x, baseY - h * 0.3, x + w * 0.08, baseY]).fill(0x4a3420);
};

/** A curved tusk rising from `baseY`, bending toward `dir`. */
const tusk = (ctx: DrawContext, x: number, baseY: number, height: number, dir: 1 | -1, color: number): void => {
  const left: number[] = [];
  const right: number[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x + dir * height * 0.5 * t * t;
    const cy = baseY - height * t;
    const half = height * 0.08 * (1 - t);
    left.push(cx - half, cy);
    right.unshift(cx + half, cy);
  }
  ctx.g.poly([...left, ...right]).fill(color);
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** A radial fill that fades `color` out to the shape's edge. Make one per colour and reuse it: each is a texture. */
const softFill = (ctx: DrawContext, color: number): FillGradient =>
  ctx.radial([[0, rgba(color, 1)], [0.45, rgba(color, 0.6)], [1, rgba(color, 0)]]);

/** A soft-edged ellipse, for painterly clouds, haze and patches of light. */
const puff = (
  ctx: DrawContext, fill: FillGradient, x: number, y: number, rx: number, ry: number, alpha: number,
): void => {
  ctx.g.ellipse(x, y, rx, ry).fill({ fill, alpha });
};

/** A tapering rock pillar with its right side in shade. */
const spire = (ctx: DrawContext, x: number, baseY: number, w: number, h: number, color: number, shade: number) => {
  const top = baseY - h;
  ctx.g.poly([x - w / 2, baseY, x - w * 0.36, top + h * 0.15, x - w * 0.15, top, x + w * 0.2, top + h * 0.05,
    x + w * 0.4, top + h * 0.2, x + w / 2, baseY]).fill(color);
  ctx.g.poly([x + w * 0.05, top + h * 0.03, x + w * 0.2, top + h * 0.05, x + w * 0.4, top + h * 0.2, x + w / 2, baseY,
    x + w * 0.12, baseY]).fill(shade);
};

/** A carved pole of painted bands, topped with a face block and two wings. */
const totem = (
  ctx: DrawContext, x: number, baseY: number, h: number, wood: number, paint: number, accent: number,
): void => {
  const w = h * 0.12;
  const top = baseY - h;
  ctx.g.rect(x - w / 2, top, w, h).fill(wood);
  ctx.g.rect(x + w * 0.15, top, w * 0.35, h).fill({ color: 0x000000, alpha: 0.22 });
  for (let i = 0; i < 3; i++) {
    ctx.g.rect(x - w / 2 - 2, baseY - h * (0.3 + i * 0.18), w + 4, 4).fill(accent);
  }
  leaf(ctx, x - w * 0.8, top + w * 0.2, w * 1.3, -2.7, accent);
  leaf(ctx, x + w * 0.8, top + w * 0.2, w * 1.3, -0.45, accent);
  ctx.g.rect(x - w * 0.9, top - w * 0.2, w * 1.8, w * 1.3).fill(paint);
  ctx.g.rect(x - w * 0.55, top + w * 0.15, w * 0.35, w * 0.22).rect(x + w * 0.2, top + w * 0.15, w * 0.35, w * 0.22)
    .fill(0x1a1008);
  ctx.g.rect(x - w * 0.6, top + w * 0.65, w * 1.2, w * 0.22).fill(0xf2e8dc);
};

/** A spear from `(x1, y1)` to a hooked blade at `(x2, y2)`. */
const spear = (ctx: DrawContext, x1: number, y1: number, x2: number, y2: number): void => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 5, color: 0x5a3a26 });
  leaf(ctx, x2, y2, 64, angle, 0xc8ccd4);
  const pt = rotator(x2, y2, angle);
  const [hx, hy] = pt(22, 0);
  leaf(ctx, hx, hy, 26, angle + 2.5, 0x9aa0aa);
  for (let i = 0; i < 3; i++) {
    const [bx, by] = pt(-6 - i * 6, 0);
    ctx.g.circle(bx, by, 4).fill(0x2a1a10);
  }
};

/** The four corners of a `w` by `h` box at `(x, y)` in a rotated frame, for `poly`. */
const box = (pt: ReturnType<typeof rotator>, x: number, y: number, w: number, h: number): number[] =>
  [...pt(x, y), ...pt(x + w, y), ...pt(x + w, y + h), ...pt(x, y + h)];

/**
 * A painted diamond shield turned by `angle`: gold rim, `base` colour, a pale centre stripe, and optionally green
 * eyes.
 */
const shield = (
  ctx: DrawContext, x: number, y: number, w: number, h: number, angle: number, base: number, stripe: number,
  eyes = false,
): void => {
  const pt = rotator(x, y, angle);
  const diamond = (s: number, sw = s) => [...pt(0, -h * s), ...pt(w * sw, 0), ...pt(0, h * s), ...pt(-w * sw, 0)];
  ctx.g.poly(diamond(1)).fill(0xd8a850);
  ctx.g.poly(diamond(0.86)).fill(base);
  ctx.g.poly(diamond(0.86, 0.22)).fill(stripe);
  if (eyes) {
    ctx.g.poly([...pt(-w * 0.5, -h * 0.2), ...pt(-w * 0.22, -h * 0.12), ...pt(-w * 0.44, -h * 0.07)])
      .poly([...pt(w * 0.5, -h * 0.2), ...pt(w * 0.22, -h * 0.12), ...pt(w * 0.44, -h * 0.07)]).fill(0x30c890);
  }
};

/** A small glowing vial on a string from `(x, y)`, swung by `angle` around that point. */
const bottle = (ctx: DrawContext, x: number, y: number, angle: number, color: number): void => {
  const pt = rotator(x, y, angle);
  const [cx, cy] = pt(0, 52);
  ctx.g.moveTo(x, y).lineTo(...pt(0, 40)).stroke({ width: 1.5, color: 0x8a7a68 });
  glow(ctx, cx, cy, 44, color, 0.5);
  ctx.g.poly(box(pt, -7, 44, 14, 18)).fill(color);
  ctx.g.poly(box(pt, -3, 40, 6, 5)).fill(0xd8d0c0);
  ctx.g.poly(box(pt, -5, 46, 3, 12)).fill({ color: 0xffffff, alpha: 0.4 });
};

/** A stitched burlap doll on a string from `(x, y)`, swung by `angle`, with a pin through its head. */
const doll = (ctx: DrawContext, x: number, y: number, size: number, angle: number): void => {
  const burlap = 0x7a5a3a;
  const pt = rotator(x, y, angle);
  const head = size * 1.4;
  const [hx, hy] = pt(0, head);
  ctx.g.moveTo(x, y).lineTo(hx, hy).stroke({ width: 1.5, color: 0x8a7a68 });
  ctx.g.circle(hx, hy, size * 0.35).fill(burlap);
  ctx.g.poly(box(pt, -size * 0.22, head + size * 0.3, size * 0.44, size * 0.6))
    .poly(box(pt, -size * 0.7, head + size * 0.4, size * 1.4, size * 0.14))
    .poly(box(pt, -size * 0.22, head + size * 0.85, size * 0.14, size * 0.4))
    .poly(box(pt, size * 0.08, head + size * 0.85, size * 0.14, size * 0.4)).fill(burlap);
  const cross = (ex: number) => {
    ctx.g.moveTo(...pt(ex - size * 0.07, head - size * 0.1)).lineTo(...pt(ex + size * 0.07, head + size * 0.04))
      .moveTo(...pt(ex + size * 0.07, head - size * 0.1)).lineTo(...pt(ex - size * 0.07, head + size * 0.04));
  };
  cross(-size * 0.13);
  cross(size * 0.13);
  ctx.g.stroke({ width: 1.5, color: 0x1a0a06 });
  const [px, py] = pt(size * 0.5, head - size * 0.6);
  ctx.g.moveTo(hx, hy).lineTo(px, py).stroke({ width: 1.5, color: 0xc8ccd4 });
  ctx.g.circle(px, py, 3).fill(0xa040c0);
};

/**
 * A hanging charm: a rope web behind crossed spears, painted shields and vials, each piece tilted a little at random
 * so nothing sits square. `flip` mirrors it.
 */
const charm = (ctx: DrawContext, random: Random, x: number, y: number, size: number, flip: 1 | -1): void => {
  const tilt = (max: number) => (random() - 0.5) * 2 * max;
  const spokes = 8;
  const turn = tilt(0.3);
  const at = (k: number, r: number) => {
    const a = (k * Math.PI * 2) / spokes + turn;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r];
  };
  for (let k = 0; k < spokes; k++) {
    const [sx, sy] = at(k, size);
    ctx.g.moveTo(x, y).lineTo(sx, sy);
  }
  [0.45, 0.8].forEach((r) => {
    const [fx, fy] = at(0, size * r);
    ctx.g.moveTo(fx, fy);
    for (let k = 1; k <= spokes; k++) {
      const [px, py] = at(k, size * r);
      ctx.g.lineTo(px, py);
    }
  });
  ctx.g.stroke({ width: 1.5, color: 0x6a5a48, alpha: 0.7 });
  const j = () => tilt(size * 0.1);
  spear(ctx, x - size * 0.9 + j(), y + size * 0.9 + j(), x + size * 0.95 + j(), y - size * 0.85 + j());
  spear(ctx, x + size * 0.9 + j(), y + size * 0.9 + j(), x - size * 0.95 + j(), y - size * 0.85 + j());
  tusk(ctx, x - size * 0.55, y + size * 0.55, size * 0.5, 1, 0xe8dccc);
  tusk(ctx, x + size * 0.55, y + size * 0.55, size * 0.5, -1, 0xe8dccc);
  shield(ctx, x + flip * size * 0.55, y - size * 0.45, size * 0.2, size * 0.32, tilt(0.6), 0x8a4aa8, 0xf2e8dc);
  shield(ctx, x - flip * size * 0.5, y - size * 0.25, size * 0.18, size * 0.28, tilt(0.6), 0xc8302a, 0xf2e8dc);
  shield(ctx, x, y + size * 0.05, size * 0.3, size * 0.52, tilt(0.04), 0xc8302a, 0xf2e8dc, true);
  bottle(ctx, x - flip * size * 0.85, y - size * 0.2 - 40, tilt(0.3), 0x3a5ad8);
  bottle(ctx, x + flip * size * 0.85, y - size * 0.1 - 40, tilt(0.3), 0xa060e0);
  bottle(ctx, x - flip * size * 0.3, y + size * 0.85 - 40, tilt(0.3), 0x40c060);
};

const jungleForest = (ctx: DrawContext): void => {
  const random = createRandom(67);
  const sun = { x: W * 0.1, y: H * 0.12 };
  sky(ctx, [[0, 0x2a3a16], [0.3, 0x8a9a3a], [0.5, 0xf0dc78], [0.66, 0x9a8a3e], [1, 0x1a1408]]);
  glow(ctx, sun.x, sun.y, 380, 0xfff0a0, 0.65);
  rays(ctx, sun.x, sun.y, 0.25, 1.25, 9, 1100, 0xfff3b0, 0.16);
  const far = ridge(random, H * 0.56, 120, 0.15);
  fillBelow(ctx, far, 0x6a7e38);
  ziggurat(ctx, W * 0.7, ridgeAt(far, W * 0.7) + 20, 220, 5, 26, 0x7a6a42, 0xa8965e, 0x4a4026);
  band(ctx, H * 0.58, 110, 0xe8dc8c, 0.4);
  const mid = ridge(random, H * 0.72, 40, 0.1);
  fillBelow(ctx, mid, 0x3c5a22);
  for (let x = LEFT; x < RIGHT; x += 60 + random() * 80) {
    palm(ctx, random, x, ridgeAt(mid, x) + 6, 70 + random() * 60, 0x3c5a22);
  }
  band(ctx, H * 0.76, 90, 0xc8cc78, 0.3);
  const near = ridge(random, H * 0.88, 30, 0);
  fillBelow(ctx, near, 0x2e2412);
  // Tall palms only near the edges, so the middle stays open behind the popup.
  [W * 0.02, W * 0.1, W * 0.9, W * 0.98].forEach((x) => {
    palm(ctx, random, x, ridgeAt(near, x) + 10, 220 + random() * 100, 0x1a1a0c);
  });
  // Canopy along the top, with vines hanging from it.
  ctx.g.poly([...ridge(random, H * 0.06, -50, 0.2), RIGHT, TOP, LEFT, TOP]).fill(0x0e1808);
  for (let i = 0; i < 26; i++) {
    const x = LEFT + random() * (RIGHT - LEFT);
    const len = 60 + random() * 260;
    const sway = (random() - 0.5) * 60;
    ctx.g.moveTo(x, TOP).quadraticCurveTo(x + sway, TOP + len * 0.6, x + sway * 0.3, TOP + len)
      .stroke({ width: 1.5 + random() * 2, color: 0x1a2a0e });
    leaf(ctx, x + sway * 0.3, TOP + len, 14 + random() * 10, Math.PI / 2 + (random() - 0.5), 0x2a4214);
  }
  // Big leaves in the bottom corners.
  for (let i = 0; i < 30; i++) {
    const left = i % 2 === 0;
    const x = left ? LEFT + random() * 180 : RIGHT - random() * 180;
    const angle = left ? -0.3 - random() * 1.1 : -Math.PI + 0.3 + random() * 1.1;
    leaf(ctx, x, BOTTOM - random() * 80, 120 + random() * 120, angle, random() > 0.5 ? 0x0c1606 : 0x2a3010, 0.2);
  }
  motes(ctx, random, 70, TOP, H * 0.7, [0xfff2a0, 0xe0e890], 1.8);
  vignette(ctx, 0.5);
};

const redVolcano = (ctx: DrawContext): void => {
  const random = createRandom(79);
  const crater = { x: W * 0.84, y: H * 0.3 };
  sky(ctx, [[0, 0x070303], [0.3, 0x240806], [0.55, 0x701a0a], [0.7, 0x3a0e08], [1, 0x080303]]);
  for (let i = 0; i < 18; i++) {
    const t = i / 18;
    ctx.g.ellipse(crater.x - t * W * 0.35 + (random() - 0.5) * 40, crater.y - 20 - t * H * 0.3, 50 + t * 120,
      25 + t * 40).fill({ color: 0x1a0c0a, alpha: 0.5 });
  }
  glow(ctx, crater.x, crater.y, 260, 0xff5a1a, 0.6);
  fillBelow(ctx, ridge(random, H * 0.58, 160, 0.7), 0x1e0a08);
  ctx.g.poly([crater.x - 260, H * 0.7, crater.x - 40, crater.y, crater.x + 40, crater.y, crater.x + 260, H * 0.7])
    .fill(0x2a0e0a);
  ctx.g.ellipse(crater.x, crater.y, 40, 6).fill(0xffa040);
  for (let i = 0; i < 4; i++) {
    const x = crater.x + (random() - 0.5) * 60;
    ctx.g.moveTo(x, crater.y).quadraticCurveTo(x + (random() - 0.5) * 120, crater.y + 80,
      x + (random() - 0.5) * 220, H * 0.66).stroke({ width: 2 + random() * 3, color: 0xff6a1a, alpha: 0.85 });
  }
  band(ctx, H * 0.62, 90, 0xff4a10, 0.25);
  // A cliff on the left, with lava pouring off it.
  ctx.g.poly([LEFT, TOP, W * 0.18, TOP, W * 0.2, H * 0.3, W * 0.16, H * 0.5, W * 0.18, H * 0.8, LEFT, BOTTOM])
    .fill(0x120605);
  [W * 0.05, W * 0.13].forEach((x, i) => {
    const top = H * (0.2 + i * 0.12);
    glow(ctx, x, H * 0.6, 180, 0xff5010, 0.5);
    ctx.g.rect(x - 10 + i * 3, top, 20 - i * 6, H * 0.85 - top)
      .fill(ctx.linear([[0, 0xffe080], [0.3, 0xff8a20], [1, 0xd8300a]]));
  });
  // Basalt columns, their tops catching the glow.
  for (let x = LEFT; x < RIGHT; x += 14 + random() * 18) {
    const h = 30 + random() * 90;
    const w = 14 + random() * 16;
    ctx.g.rect(x, H * 0.78 - h, w, h + 100).fill(0x150706);
    ctx.g.rect(x, H * 0.78 - h, w, 3).fill({ color: 0xff5a1a, alpha: 0.5 });
  }
  ctx.g.poly([...ridge(random, H * 0.84, 8, 0), RIGHT, BOTTOM, LEFT, BOTTOM])
    .fill(ctx.linear([[0, 0xffd060], [0.15, 0xff7a1a], [1, 0x8a1806]]));
  for (let i = 0; i < 60; i++) {
    ctx.g.ellipse(LEFT + random() * (RIGHT - LEFT), H * (0.86 + random() * 0.12), 8 + random() * 30, 1.5)
      .fill({ color: 0xffe8a0, alpha: 0.5 });
  }
  glow(ctx, W * 0.5, H * 0.95, 420, 0xff6a20, 0.45);
  fillBelow(ctx, ridge(random, H * 0.97, 70, 0.15, 4), 0x050202);
  motes(ctx, random, 160, TOP, BOTTOM, [0xffb040, 0xff6a1a, 0xffe08a], 2);
  vignette(ctx, 0.6);
};

const duneProwl = (ctx: DrawContext): void => {
  const random = createRandom(97);
  const sun = { x: W * 0.62, y: H * 0.52 };
  sky(ctx, [[0, 0x8a5a50], [0.3, 0xb87e6a], [0.5, 0xe0a888], [0.62, 0xf4c8a0], [0.7, 0xe0b088], [1, 0xc08a60]]);
  glow(ctx, sun.x, sun.y, 560, 0xffe0b0, 0.7);
  glow(ctx, sun.x, sun.y, 170, 0xfff8e0, 0.9);
  rays(ctx, sun.x, sun.y, -2.8, -0.4, 10, 900, 0xfff0d0, 0.05);
  // Jagged ranges right of the sun: overlapping peaks with uneven slopes, fading into the haze.
  const range = (baseY: number, amp: number, color: number) => {
    const peaks = Array.from({ length: 9 }, () => ({
      x: W * (0.42 + random() * 0.66),
      h: amp * (0.3 + random() * 0.7),
      slope: 0.5 + random() * 0.9,
    }));
    const points: number[] = [];
    for (let x = LEFT; x <= RIGHT; x += 4) {
      const height = Math.max(0, ...peaks.map((p) => p.h - Math.abs(x - p.x) * p.slope));
      points.push(x, baseY - height - random() * 3);
    }
    fillBelow(ctx, points, color);
  };
  fillBelow(ctx, ridge(random, H * 0.63, 40, 0.3, 4), 0xeec0a0);
  range(H * 0.63, 150, 0xe8b498);
  band(ctx, H * 0.6, 100, 0xf8d0b0, 0.5);
  range(H * 0.68, 210, 0xb88070);
  band(ctx, H * 0.67, 70, 0xf4c8a0, 0.45);
  // A long dune rising to the left, with weathered stone spires along it.
  const slopeBase = ridge(random, H * 0.68, 16, 0);
  const slope = slopeBase.map((v, i) => (i % 2 === 0 ? v
    : v - 130 * clamp01((W * 0.5 - slopeBase[i - 1]) / (W * 0.55)) ** 1.4));
  dune(ctx, slope, 0xecc496, 0xdcac7e, 4);
  ([[0.14, 110, 1], [0.2, 84, -1], [0.25, 64, 1], [0.3, 40, -1]] as const).forEach(([fx, h, dir]) => {
    tusk(ctx, W * fx, ridgeAt(slope, W * fx) + 6, h, dir, 0xb08470);
  });
  band(ctx, H * 0.7, 60, 0xf8d8b0, 0.4);
  dune(ctx, ridge(random, H * 0.8, 26, 0), 0xe6b886, 0xd49e6e, 6);
  // Ripples, and the sun's glare trailing toward the viewer.
  for (let i = 0; i < 70; i++) {
    ctx.g.ellipse(LEFT + random() * (RIGHT - LEFT), H * (0.78 + random() * 0.22), 20 + random() * 60, 1.2)
      .fill({ color: 0xa8704a, alpha: 0.18 });
  }
  for (let i = 0; i < 90; i++) {
    const y = H * (0.74 + random() * 0.26);
    const spread = 60 + (y - H * 0.74) * 1.6;
    ctx.g.ellipse(sun.x + (random() - 0.5) * spread, y, 10 + random() * 40, 1.2)
      .fill({ color: 0xfff4dc, alpha: 0.15 + random() * 0.3 });
  }
  motes(ctx, random, 50, H * 0.3, BOTTOM, [0xfff0d8], 1.2);
  vignette(ctx, 0.35);
};

const plainMulgore = (ctx: DrawContext): void => {
  const random = createRandom(101);
  const horizon = H * 0.6;
  sky(ctx, [[0, 0x2a64a8], [0.25, 0x5a90c8], [0.45, 0xa8c4d8], [0.58, 0xdce4e4], [1, 0x7a9a6a]]);
  // Bright billowing cloud on the left, a grey storm mass on the right.
  const white = softFill(ctx, 0xffffff);
  const grey = softFill(ctx, 0x7a8698);
  for (let i = 0; i < 14; i++) {
    puff(ctx, grey, W * (0.68 + random() * 0.4), H * random() * 0.5, 160 + random() * 160, 90 + random() * 80, 0.55);
  }
  for (let i = 0; i < 26; i++) {
    puff(ctx, white, W * (0.08 + random() * 0.7), H * (0.04 + random() * 0.42), 90 + random() * 140,
      40 + random() * 70, 0.6);
  }
  glow(ctx, W * 0.55, H * 0.18, 300, 0xfff8e0, 0.6);
  rays(ctx, W * 0.55, H * 0.18, 1.5, 2.3, 6, 700, 0xfff8e0, 0.06);
  fillBelow(ctx, ridge(random, horizon, 70, 0.5), 0xaab8c6);
  // A tall plateau in the haze, with buildings on top and thinner spires roped to it.
  const mesaX = W * 0.66;
  const mesaTop = H * 0.28;
  [[W * 0.55, H * 0.42, 50], [W * 0.79, H * 0.36, 60]].forEach(([x, top, w]) => {
    spire(ctx, x, horizon + 20, w, horizon + 20 - top, 0xc0c6d0, 0xaab2c0);
    ctx.g.moveTo(mesaX, mesaTop + 10).lineTo(x, top + 6).stroke({ width: 1, color: 0x8a92a0 });
  });
  ctx.g.poly([mesaX - 100, horizon + 20, mesaX - 80, mesaTop, mesaX + 80, mesaTop, mesaX + 100, horizon + 20])
    .fill(0xb4bcc8);
  ctx.g.poly([mesaX + 20, mesaTop, mesaX + 80, mesaTop, mesaX + 100, horizon + 20, mesaX + 30, horizon + 20])
    .fill(0x9ea6b4);
  ctx.g.rect(mesaX - 60, mesaTop - 18, 34, 18).rect(mesaX + 20, mesaTop - 14, 40, 14)
    .rect(mesaX - 8, mesaTop - 60, 14, 60).fill(0x98a0ae);
  ctx.g.poly([mesaX - 64, mesaTop - 18, mesaX - 43, mesaTop - 36, mesaX - 22, mesaTop - 18]).fill(0x98a0ae);
  band(ctx, horizon, 140, 0xe4ecf2, 0.55);
  // The valley floor, with a lake catching the sky.
  fillBelow(ctx, ridge(random, horizon + 18, 12, 0), 0x96b676);
  ctx.g.ellipse(W * 0.62, H * 0.7, 110, 9).fill(0xbcd4e4);
  // Sandstone cliffs on the left, streaked, with grass and pines along the rim.
  const rim: number[] = [];
  for (let x = LEFT; x <= W * 0.22; x += 6) {
    rim.push(x, H * 0.1 + ((x - LEFT) / (W * 0.22 - LEFT)) ** 2 * H * 0.26 + random() * 4);
  }
  ctx.g.poly([...rim, W * 0.27, H * 0.66, LEFT, H * 0.72]).fill(0xb07a5a);
  for (let i = 0; i < 40; i++) {
    const x = LEFT + random() * (W * 0.22 - LEFT);
    const top = ridgeAt(rim, x) + 4;
    ctx.g.rect(x, top, 2 + random() * 6, H * 0.66 - top).fill({ color: random() > 0.5 ? 0xd8a27a : 0x7a4a36,
      alpha: 0.3 });
  }
  // Ledges, some holding grass.
  for (let i = 0; i < 12; i++) {
    const x = LEFT + random() * (W * 0.2 - LEFT);
    const y = ridgeAt(rim, x) + 20 + random() * (H * 0.6 - ridgeAt(rim, x));
    ctx.g.rect(x, y, 30 + random() * 50, 4).fill({ color: 0x6a3a2a, alpha: 0.5 });
    ctx.g.rect(x, y - 4, 20 + random() * 30, 4).fill({ color: 0x6a9a3a, alpha: random() > 0.5 ? 0.8 : 0 });
  }
  const grassLine: number[] = [];
  for (let i = rim.length - 2; i >= 0; i -= 2) {
    grassLine.push(rim[i], rim[i + 1] + 10);
  }
  ctx.g.poly([...rim, ...grassLine]).fill(0x6a9a3a);
  for (let i = 0; i < rim.length; i += 8) {
    pine(ctx, rim[i], rim[i + 1] + 4, 20 + random() * 24, 0x2a4a26);
  }
  spire(ctx, W * 0.27, H * 0.68, 64, 130, 0xa87256, 0x7e5240);
  spire(ctx, W * 0.34, H * 0.68, 50, 90, 0xa87256, 0x7e5240);
  // A green hill rising on the right.
  ctx.g.poly([W * 0.76, H * 0.72, W * 0.9, H * 0.52, RIGHT, H * 0.44, RIGHT, BOTTOM, W * 0.76, BOTTOM]).fill(0x5a8a3a);
  ctx.g.poly([W * 0.92, H * 0.5, RIGHT, H * 0.43, RIGHT, H * 0.56, W * 0.95, H * 0.58]).fill(0x8a6a58);
  const mid = ridge(random, H * 0.76, 30, 0);
  fillBelow(ctx, mid, 0x6a9e3c);
  const sunlit = softFill(ctx, 0xe4ec7a);
  for (let i = 0; i < 5; i++) {
    puff(ctx, sunlit, W * (0.15 + random() * 0.5), H * (0.8 + random() * 0.08), 160 + random() * 80, 30, 0.55);
  }
  ctx.g.moveTo(LEFT, H * 0.96).quadraticCurveTo(W * 0.25, H * 0.84, W * 0.5, H * 0.82)
    .stroke({ width: 26, color: 0xd0a878, alpha: 0.85 });
  ctx.g.moveTo(W * 0.5, H * 0.82).quadraticCurveTo(W * 0.58, H * 0.8, W * 0.66, H * 0.75)
    .stroke({ width: 12, color: 0xd0a878, alpha: 0.7 });
  tent(ctx, W * 0.43, ridgeAt(mid, W * 0.43) + 4, 50, 0xe8dcc0, 0x8a5a3a);
  totem(ctx, W * 0.28, H * 0.9, 190, 0x6a4a2e, 0xc8402a, 0x3a9a8a);
  // Dark grass and a weathered post in the foreground.
  const near = ridge(random, H * 0.97, 30, 0);
  fillBelow(ctx, near, 0x2e4220);
  for (let i = 0; i < 200; i++) {
    const x = LEFT + random() * (RIGHT - LEFT);
    const base = ridgeAt(near, x) + random() * 30;
    const h = 10 + random() * 26;
    ctx.g.poly([x - 2, base, x + (random() - 0.5) * h * 0.6, base - h, x + 2, base])
      .fill(random() > 0.5 ? 0x3a5a26 : 0x22341a);
  }
  ctx.g.poly([W * 0.74, H * 0.8, RIGHT, H * 0.74, RIGHT, H * 0.77, W * 0.74, H * 0.83]).fill(0x4a3426);
  ctx.g.rect(W * 0.88, H * 0.72, 34, BOTTOM - H * 0.72).fill(0x3a2a1e);
  ctx.g.rect(W * 0.88, H * 0.76, 34, 8).fill(0x8a2a1e);
  vignette(ctx, 0.3);
};

const theVoodoo = (ctx: DrawContext): void => {
  const random = createRandom(113);
  sky(ctx, [[0, 0x050306], [0.5, 0x140810], [0.8, 0x24080c], [1, 0x0a0305]]);
  glow(ctx, W * 0.5, H * 1.05, 460, 0xb8201a, 0.4);
  const far = ridge(random, H * 0.84, 40, 0.2);
  fillBelow(ctx, far, 0x14060a);
  for (let x = LEFT; x < RIGHT; x += 80 + random() * 120) {
    palm(ctx, random, x, ridgeAt(far, x) + 6, 90 + random() * 70, 0x14060a);
  }
  glow(ctx, W * 0.12, H * 0.4, 300, 0x8a1a1a, 0.45);
  glow(ctx, W * 0.88, H * 0.44, 280, 0x8a1a1a, 0.45);
  charm(ctx, random, W * 0.12, H * 0.4, 200, 1);
  charm(ctx, random, W * 0.88, H * 0.44, 180, -1);
  tusk(ctx, W * 0.02, BOTTOM, 170, 1, 0xe8dccc);
  tusk(ctx, W * 0.98, BOTTOM, 170, -1, 0xe8dccc);
  doll(ctx, W * 0.74, H * 0.8 - 42, 30, 0.25);
  motes(ctx, random, 80, H * 0.3, BOTTOM, [0xffd040, 0xffffff, 0xff5a2a], 1.6);
  vignette(ctx, 0.5);
};

export const BACKGROUND_VARIANTS = {
  moonlitForest,
  duskCoast,
  crystalCavern,
  mistyPeaks,
  jungleForest,
  redVolcano,
  duneProwl,
  plainMulgore,
  theVoodoo,
} satisfies Record<BackgroundVariant, (ctx: DrawContext) => void>;

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
export const createBackdrop = (renderer: Renderer, initial: BackgroundVariant = DEFAULT_BACKGROUND): Backdrop => {
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
      backdrop.setVariant(nextBackground(backdrop.variant));
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
