import type { Graphics } from "pixi.js";
import type { PieceSpec } from "./pieces";
import { PALETTE } from "./palette";

/** Icon size in CSS pixels. Icons are white with a dark outline: set `tint` to colour them. */
export const ICON_SIZE = 16;

type Path = (g: Graphics) => Graphics;

/** Strokes `path` twice, a wide dark outline and then a white line, so a tint keeps the outline. */
const outlined = (path: Path, width = 2): PieceSpec => ({
  width: ICON_SIZE,
  height: ICON_SIZE,
  draw: ({ g }) => {
    path(g).stroke({ width: width + 2, color: PALETTE.ink, cap: "round", join: "round" });
    path(g).stroke({ width, color: 0xffffff, cap: "round", join: "round" });
  },
});

const s = ICON_SIZE;

/** A padlock: white shackle and body over a dark outline, a dark keyhole. Open, the shackle is lifted out. */
const padlock = (open: boolean): PieceSpec => ({
  width: ICON_SIZE,
  height: ICON_SIZE,
  draw: ({ g }) => {
    const lift = open ? 2 : 0;
    const shackle = () => g.moveTo(5, 8 - lift).lineTo(5, 5.5 - lift).arc(8, 5.5 - lift, 3, Math.PI, 0)
      .lineTo(11, open ? 4 : 8);
    shackle().stroke({ width: 4, color: PALETTE.ink, cap: "round" });
    g.roundRect(2.5, 7, 11, 8.5, 2).fill(PALETTE.ink);
    shackle().stroke({ width: 2, color: 0xffffff, cap: "round" });
    g.roundRect(3.5, 8, 9, 6.5, 1.5).fill(0xffffff);
    g.rect(7.4, 10, 1.2, 2.5).fill(PALETTE.ink);
  },
});

export const ICONS = {
  chevronUp: outlined((g) => g.moveTo(4, 10).lineTo(8, 6).lineTo(12, 10)),
  chevronDown: outlined((g) => g.moveTo(4, 6).lineTo(8, 10).lineTo(12, 6)),
  chevronRight: outlined((g) => g.moveTo(6, 4).lineTo(10, 8).lineTo(6, 12)),
  minus: outlined((g) => g.moveTo(3.5, 8).lineTo(12.5, 8), 2.5),
  plus: outlined((g) => g.moveTo(3.5, 8).lineTo(12.5, 8).moveTo(8, 3.5).lineTo(8, 12.5), 2.5),
  check: outlined((g) => g.moveTo(3.5, 8.5).lineTo(6.5, 11.5).lineTo(12.5, 4.5), 2.5),
  search: outlined((g) => g.circle(6.5, 6.5, 3.5).moveTo(9.2, 9.2).lineTo(12.5, 12.5), 1.75),
  /** Double chevron shown before a recipe name, tinted with a `DIFFICULTY_COLORS` entry. */
  difficulty: outlined((g) => g.moveTo(4, 8).lineTo(8, 4.5).lineTo(12, 8)
    .moveTo(4, 12.5).lineTo(8, 9).lineTo(12, 12.5)),
  lock: padlock(false),
  unlock: padlock(true),
  star: {
    width: s,
    height: s,
    draw: ({ g }) => {
      g.star(8, 8.5, 5, 7, 3, 0).fill(PALETTE.ink);
      g.star(8, 8.5, 5, 5.6, 2.3, 0).fill(0xffffff);
    },
  },
} satisfies Record<string, PieceSpec>;

export type IconName = keyof typeof ICONS;
