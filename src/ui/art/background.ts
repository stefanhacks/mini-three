import { BlurFilter, Container, Rectangle, type Renderer, Sprite, type Texture } from "pixi.js";
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

/** A flat-topped butte with its right face in shade. */
const mesa = (
  ctx: DrawContext, x: number, baseY: number, width: number, height: number, color: number, shade: number,
): void => {
  const top = baseY - height;
  const inset = width * 0.12;
  ctx.g.poly([x - width / 2, baseY, x - width / 2 + inset, top, x + width / 2 - inset, top, x + width / 2, baseY])
    .fill(color);
  ctx.g.poly([x + width * 0.1, top, x + width / 2 - inset, top, x + width / 2, baseY, x + width * 0.2, baseY])
    .fill(shade);
  ctx.g.rect(x - width / 2 + inset, top, width - inset * 2, 3).fill({ color: 0xffffff, alpha: 0.2 });
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

const cloud = (ctx: DrawContext, random: Random, x: number, y: number, size: number): void => {
  ctx.g.ellipse(x, y + size * 0.12, size * 0.9, size * 0.18).fill({ color: 0xb8cce0, alpha: 0.9 });
  for (let i = 0; i < 6; i++) {
    ctx.g.ellipse(x + (random() - 0.5) * size * 1.4, y - random() * size * 0.2, size * (0.25 + random() * 0.25),
      size * (0.16 + random() * 0.12)).fill(0xf8fbff);
  }
};

const roundTree = (
  ctx: DrawContext, random: Random, x: number, baseY: number, h: number, trunk: number, crown: number,
): void => {
  ctx.g.rect(x - h * 0.04, baseY - h * 0.5, h * 0.08, h * 0.5).fill(trunk);
  for (let i = 0; i < 3; i++) {
    ctx.g.circle(x + (random() - 0.5) * h * 0.3, baseY - h * (0.6 + random() * 0.25), h * (0.2 + random() * 0.1))
      .fill(crown);
  }
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

const flame = (ctx: DrawContext, x: number, baseY: number, height: number, color: number): void => {
  const w = height * 0.35;
  ctx.g.moveTo(x - w / 2, baseY).quadraticCurveTo(x - w * 0.6, baseY - height * 0.5, x, baseY - height)
    .quadraticCurveTo(x + w * 0.6, baseY - height * 0.5, x + w / 2, baseY).closePath().fill(color);
};

const bonfire = (ctx: DrawContext, random: Random, x: number, baseY: number, size: number): void => {
  glow(ctx, x, baseY - size * 0.4, size * 3, 0xff7a1a, 0.55);
  glow(ctx, x, baseY - size * 0.3, size * 1.2, 0xffd060, 0.6);
  for (let i = 0; i < 4; i++) {
    const pt = rotator(x, baseY - 6, (i - 1.5) * 0.5);
    ctx.g.poly([...pt(-size * 0.5, -5), ...pt(size * 0.5, -5), ...pt(size * 0.5, 5), ...pt(-size * 0.5, 5)])
      .fill(0x1a0806);
  }
  const layers: [number, number][] = [[0xc8281a, 1], [0xff7a1a, 0.78], [0xffc23a, 0.55], [0xfff4d0, 0.3]];
  layers.forEach(([color, scale]) => {
    for (let i = 0; i < 3; i++) {
      flame(ctx, x + (random() - 0.5) * size * 0.4 * scale, baseY - 4, size * scale * (0.8 + random() * 0.4), color);
    }
  });
};

/** A painted mask on a pole, crowned with feathers. */
const mask = (ctx: DrawContext, x: number, y: number, size: number, paint: number): void => {
  const wood = 0x1a0508;
  ctx.g.rect(x - size * 0.08, y, size * 0.16, BOTTOM - y).fill(wood);
  for (let i = 0; i < 7; i++) {
    leaf(ctx, x, y - size * 0.2, size * 0.9, -Math.PI * 0.9 + (i * Math.PI * 0.8) / 6, i % 2 ? 0xffc93a : paint);
  }
  ctx.g.ellipse(x, y, size * 0.4, size * 0.55).fill(0xf2e8dc);
  ctx.g.poly([x - size * 0.28, y - size * 0.14, x - size * 0.05, y - size * 0.02, x - size * 0.24, y + size * 0.04])
    .poly([x + size * 0.28, y - size * 0.14, x + size * 0.05, y - size * 0.02, x + size * 0.24, y + size * 0.04])
    .fill(wood);
  ctx.g.rect(x - size * 0.32, y + size * 0.1, size * 0.16, size * 0.06)
    .rect(x + size * 0.16, y + size * 0.1, size * 0.16, size * 0.06)
    .rect(x - size * 0.04, y - size * 0.5, size * 0.08, size * 0.4).fill(paint);
  ctx.g.rect(x - size * 0.22, y + size * 0.24, size * 0.44, size * 0.14).fill(wood);
  for (let i = 0; i < 5; i++) {
    ctx.g.rect(x - size * 0.19 + i * size * 0.08, y + size * 0.24, size * 0.05, size * 0.06).fill(0xf2e8dc);
  }
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

const hut = (ctx: DrawContext, x: number, baseY: number, size: number, color: number, light: number): void => {
  ctx.g.rect(x - size * 0.4, baseY - size * 0.3, size * 0.05, size * 0.3)
    .rect(x + size * 0.35, baseY - size * 0.3, size * 0.05, size * 0.3)
    .rect(x - size * 0.4, baseY - size * 0.75, size * 0.8, size * 0.45).fill(color);
  ctx.g.poly([x - size * 0.6, baseY - size * 0.65, x, baseY - size * 1.5, x + size * 0.6, baseY - size * 0.65])
    .fill(color);
  glow(ctx, x, baseY - size * 0.46, size * 0.5, light, 0.4);
  ctx.g.rect(x - size * 0.1, baseY - size * 0.6, size * 0.2, size * 0.28).fill(light);
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
  const sun = { x: W * 0.86, y: H * 0.16 };
  const horizon = H * 0.58;
  sky(ctx, [[0, 0xb8622a], [0.28, 0xe89a44], [0.5, 0xf8d88a], [0.58, 0xfbe6a8], [1, 0x6a2e18]]);
  glow(ctx, sun.x, sun.y, 360, 0xfff4c8, 0.8);
  ctx.g.circle(sun.x, sun.y, 34).fill(0xfffbe6);
  mesa(ctx, W * 0.52, horizon + 10, 260, 90, 0xa4502e, 0x7a3620);
  mesa(ctx, W * 0.92, horizon + 10, 180, 60, 0xb05c34, 0x8a4026);
  band(ctx, horizon, 60, 0xfbe0a0, 0.5);
  const far = ridge(random, horizon + 30, 40, 0);
  dune(ctx, far, 0xf2c478, 0xd89a52, 6);
  ziggurat(ctx, W * 0.16, ridgeAt(far, W * 0.16) + 16, 200, 5, 20, 0x9a5430, 0xd08a4a, 0x5e2e18);
  // Broken columns beside the temple.
  [W * 0.27, W * 0.3, W * 0.33].forEach((x) => {
    const h = 20 + random() * 40;
    const base = ridgeAt(far, x) + 8;
    ctx.g.rect(x - 5, base - h, 10, h).rect(x - 7, base - h - 4, 14, 4).fill(0x8a4a2a);
  });
  band(ctx, H * 0.68, 70, 0xffe0a0, 0.3);
  dune(ctx, ridge(random, H * 0.78, 70, 0), 0xe0a058, 0xb86a36, 10);
  dune(ctx, ridge(random, H * 0.95, 60, 0), 0xb4683a, 0x7a3a1e, 12);
  motes(ctx, random, 90, H * 0.4, BOTTOM, [0xffe8b0, 0xf0c080], 1.4);
  vignette(ctx, 0.45);
};

const plainMulgore = (ctx: DrawContext): void => {
  const random = createRandom(101);
  const horizon = H * 0.56;
  sky(ctx, [[0, 0x2f7cc4], [0.35, 0x7fbbe8], [0.55, 0xd6ecfa], [0.57, 0xbcd8a0], [1, 0x2c5418]]);
  glow(ctx, W * 0.9, H * 0.08, 320, 0xffffff, 0.6);
  for (let i = 0; i < 9; i++) {
    cloud(ctx, random, LEFT + random() * (RIGHT - LEFT), H * (0.06 + random() * 0.32), 60 + random() * 70);
  }
  mesa(ctx, W * 0.1, horizon + 6, 300, 70, 0xc4a47a, 0xa48458);
  mesa(ctx, W * 0.78, horizon + 6, 220, 110, 0xb8966a, 0x987650);
  mesa(ctx, W * 0.92, horizon + 6, 160, 50, 0xc8aa80, 0xa88a5e);
  band(ctx, horizon + 4, 50, 0xd6ecfa, 0.5);
  fillBelow(ctx, ridge(random, H * 0.62, 40, 0), 0x9cc864);
  const mid = ridge(random, H * 0.74, 60, 0);
  fillBelow(ctx, mid, 0x76b044);
  for (let i = 0; i < 14; i++) {
    const x = LEFT + random() * (RIGHT - LEFT);
    roundTree(ctx, random, x, ridgeAt(mid, x) + 4, 30 + random() * 30, 0x5a4028, 0x3e7a26);
  }
  [W * 0.08, W * 0.14, W * 0.2].forEach((x) => tent(ctx, x, ridgeAt(mid, x) + 6, 60 + random() * 24, 0xe0c494,
    0x9a4a2a));
  band(ctx, H * 0.8, 60, 0xe6f4ff, 0.25);
  const near = ridge(random, H * 0.9, 50, 0);
  fillBelow(ctx, near, 0x4c8a2a);
  for (let i = 0; i < 260; i++) {
    const x = LEFT + random() * (RIGHT - LEFT);
    const ground = ridgeAt(near, x);
    const base = ground + random() * (BOTTOM - ground);
    const h = 8 + random() * 22;
    ctx.g.poly([x - 2, base, x + (random() - 0.5) * h * 0.6, base - h, x + 2, base])
      .fill(random() > 0.5 ? 0x6aa83a : 0x3a7020);
  }
  motes(ctx, random, 40, H * 0.5, BOTTOM, [0xffffff, 0xf4f0b0], 1.2);
  vignette(ctx, 0.3);
};

const theVoodoo = (ctx: DrawContext): void => {
  const random = createRandom(113);
  const moon = { x: W * 0.14, y: H * 0.15 };
  const bone = 0xf4ece0;
  sky(ctx, [[0, 0x14040a], [0.35, 0x520c16], [0.6, 0xa8201a], [0.72, 0x5a0e12], [1, 0x0e0306]]);
  stars(ctx, random, 90, H * 0.35);
  glow(ctx, moon.x, moon.y, 280, 0xffe8dc, 0.5);
  ctx.g.circle(moon.x, moon.y, 44).fill(0xfff4ea);
  band(ctx, H * 0.4, 80, 0xff6a4a, 0.25);
  const far = ridge(random, H * 0.64, 60, 0.2);
  fillBelow(ctx, far, 0x34070e);
  for (let x = LEFT; x < RIGHT; x += 50 + random() * 90) {
    palm(ctx, random, x, ridgeAt(far, x) + 6, 80 + random() * 70, 0x34070e);
  }
  band(ctx, H * 0.68, 80, 0xffd0b0, 0.2);
  const ground = ridge(random, H * 0.86, 24, 0);
  fillBelow(ctx, ground, 0x1c0408);
  hut(ctx, W * 0.72, ridgeAt(ground, W * 0.72) + 4, 90, 0x1c0408, 0xffc040);
  hut(ctx, W * 0.97, ridgeAt(ground, W * 0.97) + 4, 120, 0x1c0408, 0xffc040);
  // Tusk arches over the two fires.
  tusk(ctx, W * 0.78, BOTTOM, 230, 1, bone);
  tusk(ctx, W * 0.95, BOTTOM, 230, -1, bone);
  tusk(ctx, W * 0.02, BOTTOM, 190, 1, bone);
  tusk(ctx, W * 0.18, BOTTOM, 190, -1, bone);
  bonfire(ctx, random, W * 0.86, H * 0.95, 120);
  bonfire(ctx, random, W * 0.1, H * 0.97, 90);
  mask(ctx, W * 0.04, H * 0.5, 110, 0xd8201a);
  mask(ctx, W * 0.26, H * 0.66, 80, 0xd8201a);
  motes(ctx, random, 140, H * 0.3, BOTTOM, [0xffd040, 0xffffff, 0xff5a2a], 2);
  vignette(ctx, 0.55);
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
