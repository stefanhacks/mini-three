import { bevel, type DrawContext, innerShadow, rgba, ring } from "./draw";
import { PALETTE } from "./palette";

/** Insets, in CSS pixels, that `NineSliceSprite` keeps unstretched. */
export interface Slice {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PieceSpec {
  width: number;
  height: number;
  /** Present for pieces meant to be used as a `NineSliceSprite`; absent for fixed-size sprites. */
  slice?: Slice;
  draw: (ctx: DrawContext, w: number, h: number) => void;
}

const even = (inset: number): Slice => ({ left: inset, top: inset, right: inset, bottom: inset });

const { ink, stone, warm, bronze, gold, red, highlight, skill } = PALETTE;

/** Height of the frame's title strip, measured from the frame's top edge to the bottom of its trim. */
export const FRAME_TITLE_HEIGHT = 32;
/** How far the frame shadow reaches past the frame on every side. */
export const SHADOW_SPREAD = 18;
/** Transparent margin around side tabs, where the active tab draws its glow. */
export const TAB_GLOW = 4;

/** A bevelled gold plate with a rivet, over each corner of the frame trim. */
const cornerPlate = (ctx: DrawContext, x: number, y: number): void => {
  const { g } = ctx;
  const size = 13;
  g.rect(x, y, size, size).fill(ink);
  g.rect(x + 1, y + 1, size - 2, size - 2).fill(ctx.linear([[0, gold.light], [1, gold.dark]]));
  bevel(g, x + 1, y + 1, size - 2, size - 2, gold.bright, bronze.base, 0.8);
  const c = size / 2;
  g.circle(x + c, y + c, 3).fill(ink);
  g.circle(x + c, y + c, 2.2).fill(ctx.radial([[0, gold.bright], [0.6, gold.base], [1, bronze.base]],
    { x: 0.35, y: 0.35 }));
};

const frame: PieceSpec = {
  width: 72,
  height: 72,
  slice: { left: 16, top: 38, right: 16, bottom: 16 },
  draw: (ctx, w, h) => {
    const { g } = ctx;
    g.rect(0, 0, w, h).fill(ink);
    ring(g, 1, 1, w - 2, h - 2, bronze.base);
    bevel(g, 2, 2, w - 4, h - 4, gold.light, gold.dark);
    ring(g, 3, 3, w - 6, h - 6, gold.base);
    ring(g, 4, 4, w - 8, h - 8, bronze.dark);
    g.rect(5, 5, w - 10, h - 10).fill(stone.base);

    // Title strip.
    const stripBottom = FRAME_TITLE_HEIGHT - 3;
    g.rect(5, 5, w - 10, stripBottom - 5).fill(ctx.linear([[0, stone.deep], [1, stone.deepest]]));
    g.rect(5, 5, w - 10, 1).fill({ color: 0xffffff, alpha: 0.06 });
    g.rect(5, stripBottom, w - 10, 1).fill(ink);
    g.rect(5, stripBottom + 1, w - 10, 1).fill(bronze.light);
    g.rect(5, stripBottom + 2, w - 10, 1).fill(bronze.dark);

    // Shade under the title strip and along the inner edges.
    const bodyTop = FRAME_TITLE_HEIGHT;
    for (let i = 0; i < 5; i++) {
      g.rect(5, bodyTop + i, w - 10, 1).fill({ color: 0x000000, alpha: 0.4 * (1 - i / 5) });
    }
    for (let i = 0; i < 3; i++) {
      const alpha = 0.3 * (1 - i / 3);
      g.rect(5 + i, bodyTop, 1, h - bodyTop - 5).rect(w - 6 - i, bodyTop, 1, h - bodyTop - 5).fill({ color: 0, alpha });
      g.rect(5, h - 6 - i, w - 10, 1).fill({ color: 0, alpha });
    }

    cornerPlate(ctx, 0, 0);
    cornerPlate(ctx, w - 13, 0);
    cornerPlate(ctx, 0, h - 13);
    cornerPlate(ctx, w - 13, h - 13);
  },
};

const frameShadow: PieceSpec = {
  width: SHADOW_SPREAD * 2 + 16,
  height: SHADOW_SPREAD * 2 + 16,
  slice: even(SHADOW_SPREAD + 6),
  draw: ({ g }, w, h) => {
    for (let i = 0; i < SHADOW_SPREAD; i++) {
      const alpha = 0.05 * ((i + 1) / SHADOW_SPREAD) ** 1.5;
      g.roundRect(i, i, w - 2 * i, h - 2 * i, SHADOW_SPREAD - i + 4).fill({ color: 0x000000, alpha });
    }
  },
};

const recessedPane = (fill: number, glow: number, shadowDepth: number, size: number): PieceSpec => ({
  width: size,
  height: size,
  slice: even(shadowDepth + 2),
  draw: (ctx, w, h) => {
    const { g } = ctx;
    bevel(g, 0, 0, w, h, ink, stone.edge);
    g.rect(1, 1, w - 2, h - 2).fill(fill);
    if (glow !== fill) {
      g.rect(1, 1, w - 2, h - 2).fill(ctx.linear([[0, rgba(glow, 0.6)], [0.5, rgba(glow, 0)]]));
    }
    innerShadow(g, 1, 1, w - 2, h - 2, shadowDepth, 0.55);
  },
});

const header = (top: number, bottom: number, edge: number): PieceSpec => ({
  width: 48,
  height: 22,
  slice: { left: 8, top: 7, right: 8, bottom: 7 },
  draw: (ctx, w, h) => {
    const { g } = ctx;
    g.roundRect(0, 0, w, h, 4).fill(ink);
    g.roundRect(1, 1, w - 2, h - 2, 3).fill(ctx.linear([[0, gold.base], [1, bronze.base]]));
    g.roundRect(2, 2, w - 4, h - 4, 2).fill(ctx.linear([[0, top], [1, bottom]]));
    g.rect(3, 2, w - 6, 1).fill({ color: edge, alpha: 0.45 });
    g.rect(3, h - 3, w - 6, 1).fill({ color: 0x000000, alpha: 0.5 });
  },
});

const rowHover: PieceSpec = {
  width: 32,
  height: 18,
  slice: { left: 6, top: 2, right: 6, bottom: 2 },
  draw: (ctx, w, h) => {
    const { g } = ctx;
    const glow = highlight.hover;
    g.rect(0, 0, w, h).fill(ctx.linear([[0, rgba(glow, 0)], [0.2, rgba(glow, 0.16)], [1, rgba(glow, 0.04)]], true));
    g.rect(0, 0, w, 1).rect(0, h - 1, w, 1).fill(ctx.linear([[0, rgba(glow, 0)], [0.2, rgba(glow, 0.3)],
      [1, rgba(glow, 0)]], true));
  },
};

const rowSelected: PieceSpec = {
  width: 32,
  height: 18,
  slice: { left: 6, top: 2, right: 6, bottom: 2 },
  draw: (ctx, w, h) => {
    const { g } = ctx;
    const glow = highlight.selected;
    g.rect(0, 0, w, h).fill(ctx.linear([[0, rgba(glow, 0.1)], [0.15, rgba(glow, 0.32)], [1, rgba(glow, 0.06)]],
      true));
    g.rect(0, 0, w, 1).rect(0, h - 1, w, 1).fill(ctx.linear([[0, rgba(gold.light, 0.2)],
      [0.2, rgba(gold.light, 0.75)], [1, rgba(gold.light, 0)]], true));
  },
};

const slotBackground: PieceSpec = {
  width: 40,
  height: 40,
  slice: even(8),
  draw: (ctx, w, h) => {
    const { g } = ctx;
    g.roundRect(0, 0, w, h, 4).fill(ink);
    g.roundRect(2, 2, w - 4, h - 4, 2).fill(ctx.radial([[0, stone.raised], [1, stone.deepest]], undefined, 0.7));
    innerShadow(g, 2, 2, w - 4, h - 4, 4, 0.6);
  },
};

/** Drawn light grey on transparent so `tint` with a quality colour recolours it; the dark rim stays dark. */
const slotBorder: PieceSpec = {
  width: 40,
  height: 40,
  slice: even(8),
  draw: ({ g }, w, h) => {
    g.roundRect(0, 0, w, h, 4).stroke({ width: 1, color: ink, alignment: 1 });
    g.roundRect(1, 1, w - 2, h - 2, 3).stroke({ width: 2, color: 0xdedede, alignment: 1 });
    g.rect(2, 2, w - 4, 1).fill({ color: 0xffffff, alpha: 0.8 });
    g.roundRect(3, 3, w - 6, h - 6, 2).stroke({ width: 2, color: 0xffffff, alpha: 0.22, alignment: 1 });
  },
};

/** A side tab. Inactive primary-profession tabs get a bronze rim instead of the grey one; active tabs are gold. */
const sideTab = (active: boolean, primary = false): PieceSpec => ({
  width: 48 + TAB_GLOW * 2,
  height: 48 + TAB_GLOW * 2,
  slice: even(TAB_GLOW + 12),
  draw: (ctx, w, h) => {
    const { g } = ctx;
    const m = TAB_GLOW;
    if (active) {
      for (let i = 0; i < m; i++) {
        g.roundRect(i, i, w - 2 * i, h - 2 * i, 10 - i).fill({ color: gold.light, alpha: 0.07 + i * 0.05 });
      }
    }
    const x = m;
    const s = w - 2 * m;
    g.roundRect(x, x, s, s, 7).fill(ink);
    g.roundRect(x + 1, x + 1, s - 2, s - 2, 6).fill(active
      ? ctx.linear([[0, gold.light], [0.5, gold.base], [1, gold.dark]])
      : primary ? ctx.linear([[0, bronze.light], [1, bronze.dark]])
        : ctx.linear([[0, 0x5e5850], [1, 0x2e2a26]]));
    g.roundRect(x + 3, x + 3, s - 6, s - 6, 4).fill(ink);
    g.roundRect(x + 4, x + 4, s - 8, s - 8, 3).fill(active
      ? ctx.linear([[0, warm.raised], [1, warm.deep]])
      : ctx.linear([[0, stone.raised], [1, stone.deepest]]));
  },
});

const barTrack: PieceSpec = {
  width: 32,
  height: 18,
  slice: even(6),
  draw: (ctx, w, h) => {
    const { g } = ctx;
    g.roundRect(0, 0, w, h, 3).fill(ink);
    g.roundRect(1, 1, w - 2, h - 2, 3).fill(ctx.linear([[0, gold.light], [1, gold.dark]]));
    g.roundRect(2, 2, w - 4, h - 4, 2).fill(ink);
    g.rect(3, 3, w - 6, h - 6).fill(ctx.linear([[0, 0x000000], [1, stone.raised]]));
  },
};

/** Sits 3px inside `barTrack`; set its width to the progress. */
const barFill: PieceSpec = {
  width: 24,
  height: 12,
  slice: { left: 3, top: 4, right: 3, bottom: 4 },
  draw: (ctx, w, h) => {
    const { g } = ctx;
    g.rect(0, 0, w, h).fill(ctx.linear([[0, skill.start], [0.6, skill.mid], [1, skill.end]], true));
    g.rect(0, 0, w, h).fill(ctx.linear([[0, rgba(0xffffff, 0.35)], [0.45, rgba(0xffffff, 0.05)],
      [0.55, rgba(0x000000, 0.05)], [1, rgba(0x000000, 0.35)]]));
    g.rect(w - 1, 0, 1, h).fill({ color: 0xffffff, alpha: 0.35 });
  },
};

const button = (top: number, bottom: number, rim: [number, number], shine: number): PieceSpec => ({
  width: 64,
  height: 24,
  slice: even(6),
  draw: (ctx, w, h) => {
    const { g } = ctx;
    g.roundRect(0, 0, w, h, 4).fill(ink);
    g.roundRect(1, 1, w - 2, h - 2, 3).fill(ctx.linear([[0, rim[0]], [1, rim[1]]]));
    g.roundRect(2, 2, w - 4, h - 4, 2).fill(ctx.linear([[0, top], [1, bottom]]));
    g.rect(3, 2, w - 6, 1).fill({ color: 0xffffff, alpha: shine });
    g.rect(3, 3, w - 6, (h - 6) / 2).fill({ color: 0xffffff, alpha: shine / 3 });
  },
});

const closeButton = (top: number, bottom: number, cross: number): PieceSpec => ({
  width: 24,
  height: 24,
  draw: (ctx, w, h) => {
    const { g } = ctx;
    g.roundRect(0, 0, w, h, 5).fill(ink);
    g.roundRect(1, 1, w - 2, h - 2, 4).fill(ctx.linear([[0, gold.light], [1, gold.dark]]));
    g.roundRect(3, 3, w - 6, h - 6, 3).fill(ctx.linear([[0, top], [1, bottom]]));
    g.rect(4, 3, w - 8, 1).fill({ color: 0xffffff, alpha: 0.25 });
    const a = 8;
    const b = w - 8;
    g.moveTo(a, a).lineTo(b, b).moveTo(b, a).lineTo(a, b).stroke({ width: 4, color: ink, cap: "round" });
    g.moveTo(a, a).lineTo(b, b).moveTo(b, a).lineTo(a, b).stroke({ width: 2, color: cross, cap: "round" });
  },
});

const scrollTrack: PieceSpec = {
  width: 12,
  height: 32,
  slice: { left: 5, top: 6, right: 5, bottom: 6 },
  draw: ({ g }, w, h) => {
    g.roundRect(0, 0, w, h, 5).fill(ink);
    g.roundRect(1, 1, w - 2, h - 2, 4).fill(stone.deepest);
    g.roundRect(1, 1, w - 2, h - 2, 4).stroke({ width: 1, color: stone.edge, alpha: 0.5, alignment: 1 });
  },
};

const scrollThumb: PieceSpec = {
  width: 10,
  height: 24,
  slice: { left: 4, top: 6, right: 4, bottom: 6 },
  draw: (ctx, w, h) => {
    const { g } = ctx;
    g.roundRect(0, 0, w, h, 4).fill(ink);
    g.roundRect(1, 1, w - 2, h - 2, 3).fill(ctx.linear([[0, gold.light], [0.5, gold.base], [1, bronze.base]], true));
    g.rect(2, h / 2 - 3, w - 4, 1).rect(2, h / 2, w - 4, 1).rect(2, h / 2 + 3, w - 4, 1)
      .fill({ color: bronze.dark, alpha: 0.8 });
  },
};

const field = (border: number, glow: number): PieceSpec => ({
  width: 48,
  height: 24,
  slice: even(6),
  draw: ({ g }, w, h) => {
    g.roundRect(0, 0, w, h, 3).fill(border);
    g.roundRect(1, 1, w - 2, h - 2, 2).fill(ink);
    if (glow) {
      g.roundRect(1, 1, w - 2, h - 2, 2).stroke({ width: 2, color: glow, alpha: 0.25, alignment: 1 });
    }
    g.rect(2, 1, w - 4, 1).fill({ color: 0x000000, alpha: 0.9 });
    g.rect(2, 2, w - 4, 1).fill({ color: 0x000000, alpha: 0.5 });
  },
});

const checkbox = (border: number): PieceSpec => ({
  width: 20,
  height: 20,
  draw: (ctx, w, h) => {
    const { g } = ctx;
    g.roundRect(0, 0, w, h, 3).fill(ink);
    g.roundRect(1, 1, w - 2, h - 2, 3).fill(border);
    g.roundRect(2, 2, w - 4, h - 4, 2).fill(ctx.linear([[0, 0x000000], [1, stone.raised]]));
  },
});

const divider: PieceSpec = {
  width: 64,
  height: 2,
  slice: { left: 28, top: 0, right: 28, bottom: 0 },
  draw: (ctx, w) => {
    const { g } = ctx;
    const stops = (color: number, alpha: number) => ctx.linear([[0, rgba(color, 0)], [0.44, rgba(color, alpha)],
      [0.56, rgba(color, alpha)], [1, rgba(color, 0)]], true);
    g.rect(0, 0, w, 1).fill(stops(gold.base, 0.7));
    g.rect(0, 1, w, 1).fill(stops(0x000000, 0.8));
  },
};

/** Ring around the profession portrait in the frame's top-left corner. The centre is transparent. */
const portraitRing: PieceSpec = {
  width: 72,
  height: 72,
  draw: (ctx, w) => {
    const { g } = ctx;
    const c = w / 2;
    // `cut()` only punches through the shapes of the fill just before it, so each ring is its own fill and cut.
    g.circle(c, c, c).fill(ink).circle(c, c, c - 7).cut();
    g.circle(c, c, c - 1).fill(ctx.linear([[0, gold.bright], [0.4, gold.base], [1, bronze.dark]]))
      .circle(c, c, c - 4).cut();
    g.circle(c, c, c - 5).fill(ctx.linear([[0, bronze.dark], [1, gold.light]])).circle(c, c, c - 6).cut();
  },
};

const portraitBack: PieceSpec = {
  width: 72,
  height: 72,
  draw: (ctx, w) => {
    ctx.g.circle(w / 2, w / 2, w / 2 - 6).fill(ctx.radial([[0, red.base], [0.7, red.dark], [1, ink]]));
  },
};

export const PIECES = {
  frame,
  frameShadow,
  paneList: recessedPane(stone.deep, stone.deep, 4, 24),
  paneDetail: recessedPane(warm.deep, warm.raised, 12, 40),
  header: header(0x3c2a13, 0x1c1309, gold.light),
  headerHover: header(0x56401f, 0x2a1d0e, gold.bright),
  rowHover,
  rowSelected,
  slotBackground,
  slotBorder,
  tab: sideTab(false),
  tabActive: sideTab(true),
  tabPrimary: sideTab(false, true),
  barTrack,
  barFill,
  button: button(red.light, red.dark, [gold.light, gold.dark], 0.18),
  buttonHover: button(0xd0402a, red.base, [gold.bright, gold.base], 0.28),
  buttonDown: button(red.dark, red.base, [gold.dark, gold.light], 0.05),
  buttonDisabled: button(0x3a3632, 0x1c1a18, [0x5e5850, 0x2e2a26], 0.08),
  closeButton: closeButton(red.light, red.dark, gold.bright),
  closeButtonHover: closeButton(0xd0402a, red.base, 0xffffff),
  closeButtonDown: closeButton(red.dark, red.base, gold.light),
  scrollTrack,
  scrollThumb,
  field: field(0x4d463c, 0),
  fieldFocus: field(gold.dark, gold.light),
  checkbox: checkbox(bronze.light),
  checkboxHover: checkbox(gold.light),
  divider,
  portraitRing,
  portraitBack,
} satisfies Record<string, PieceSpec>;

export type PieceName = keyof typeof PIECES;
