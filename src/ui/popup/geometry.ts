import { PROFESSION_KEYS, TAB_GROUPS } from "../../data/keys";
import { TAB_GLOW, TAB_SIZE } from "../art";
import { stripLayout } from "../layout";
import { DESKTOP_ROWS, type RowMetrics, TOUCH_ROWS } from "./rows";

export const WINDOW_WIDTH = 720;
export const WINDOW_HEIGHT = 580;
export const TAB_STEP = 54;
/** How far the desktop side tabs tuck under the window frame. */
export const TAB_TUCK = 4;
/** Width the side tabs add to the right of the window. */
export const TABS_WIDTH = TAB_SIZE + TAB_GLOW * 2 - TAB_TUCK;
/** Space between tab groups (see TAB_GROUPS). On a phone the gaps grow to spread the tabs across the frame. */
export const TIER_GAP = 12;
/** Narrowest group gap, so very narrow phones keep the tabs on one row. */
export const MIN_TIER_GAP = 6;
const LIST_WIDTH = 290;
const CONTENT_TOP = 74;

// Mobile frame, in its own coordinates. The medallion shrinks to sit inside the title corner; everything below the
// title strip is content.
const MOBILE_PAD = 12;
const MOBILE_CONTENT_TOP = 42;
const MOBILE_PORTRAIT_SCALE = 0.66;
export const MOBILE_BUTTON_HEIGHT = 28;
/** From this frame width, the summary bar fits between Known only and Search instead of taking its own row. */
const WIDE_FRAME = 560;
/** Smallest tab cell in the mobile strip, still a comfortable touch target. */
const MIN_TAB_CELL = 44;
/** Frames shorter than this (landscape) get smaller tabs, leaving the height to the list. */
const SHORT_FRAME = 420;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The mobile tab strip: `perRow` tabs per row, each in a square `cell`. */
export type Strip = Box & { perRow: number; cell: number };

export interface Geometry {
  w: number;
  h: number;
  portrait: { x: number; y: number; scale: number };
  bar: Box;
  knownOnly: { x: number; y: number };
  /** While search is open: the field, in the list's first row slot. */
  search: Box;
  list: Box;
  detail: Box;
  searchButton: Box;
  /** The mobile tab strip; desktop has side tabs instead. */
  strip: Strip | null;
  rows: RowMetrics;
}

/**
 * Where the open search field sits: the list's first row slot, inside its pane and clear of its scrollbar. The rows
 * move down by `searchInset` to make room.
 */
const searchSlot = (list: Box, height: number): Box => ({ x: list.x + 6, y: list.y + 6, w: list.w - 30, h: height });
export const searchInset = (field: Box): number => field.h + 6;

export const desktopGeometry = (): Geometry => {
  const w = WINDOW_WIDTH;
  const h = WINDOW_HEIGHT;
  const contentHeight = h - CONTENT_TOP - 44;
  const list = { x: 16, y: CONTENT_TOP + 32, w: LIST_WIDTH, h: contentHeight - 32 };
  return {
    w,
    h,
    portrait: { x: -16, y: -16, scale: 1 },
    bar: { x: 120, y: 42, w: 440, h: 18 },
    knownOnly: { x: 20, y: CONTENT_TOP + 6 },
    search: searchSlot(list, 22),
    list,
    detail: { x: LIST_WIDTH + 24, y: CONTENT_TOP, w: w - LIST_WIDTH - 40, h: contentHeight },
    searchButton: { x: w - 16 - 120, y: h - 34, w: 120, h: 24 },
    strip: null,
    rows: DESKTOP_ROWS,
  };
};

/**
 * The mobile frame, top to bottom: title strip (portrait, Back, title), the tab strip, the summary bar, a row with
 * Known only and Search (the bar joins that row on wide frames), and the list down to the bottom. Open search sits
 * in the list's first row slot. The detail pane covers everything under the title strip.
 */
export const mobileGeometry = (w: number, h: number): Geometry => {
  const inner = w - MOBILE_PAD * 2;
  // On one row, the group gaps take their share of the width.
  const tabs = stripLayout(PROFESSION_KEYS.length, inner - MIN_TIER_GAP * (TAB_GROUPS.length - 1),
    h < SHORT_FRAME ? MIN_TAB_CELL : TAB_STEP, MIN_TAB_CELL);
  const strip = { x: MOBILE_PAD, y: MOBILE_CONTENT_TOP + 2, w: inner, h: tabs.rows * tabs.cell, perRow: tabs.perRow,
    cell: tabs.cell };
  const wide = w >= WIDE_FRAME;
  const barRow = strip.y + strip.h + 6;
  const controlsY = wide ? barRow : barRow + 18 + 6;
  const bar = wide ? { x: MOBILE_PAD + 130, y: controlsY + 5, w: inner - 260, h: 18 }
    : { x: MOBILE_PAD, y: barRow, w: inner, h: 18 };
  const listY = controlsY + MOBILE_BUTTON_HEIGHT + 6;
  const list = { x: MOBILE_PAD, y: listY, w: inner, h: h - MOBILE_PAD - listY };
  return {
    w,
    h,
    portrait: { x: -6, y: -6, scale: MOBILE_PORTRAIT_SCALE },
    bar,
    knownOnly: { x: MOBILE_PAD + 4, y: controlsY + 4 },
    search: searchSlot(list, MOBILE_BUTTON_HEIGHT),
    list,
    detail: { x: MOBILE_PAD, y: MOBILE_CONTENT_TOP, w: inner, h: h - MOBILE_PAD - MOBILE_CONTENT_TOP },
    searchButton: { x: w - MOBILE_PAD - 120, y: controlsY, w: 120, h: MOBILE_BUTTON_HEIGHT },
    strip,
    rows: TOUCH_ROWS,
  };
};
