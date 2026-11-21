export type LayoutMode = "desktop" | "mobile";

/** Size in CSS px of everything the desktop window draws: window, side tabs, and the portrait poking out. */
export interface Footprint {
  width: number;
  height: number;
}

/** Gap kept around the desktop window. */
export const DESKTOP_MARGIN = 12;
/** Below this scale the desktop window's 13 px text would render under ~10 px: use the mobile layout instead. */
export const MIN_DESKTOP_SCALE = 0.8;

/** The scale the desktop window gets in a viewport, capped at 1. */
export const desktopScale = (width: number, height: number, footprint: Footprint): number => Math.min(1,
  (width - DESKTOP_MARGIN * 2) / footprint.width, (height - DESKTOP_MARGIN * 2) / footprint.height);

/**
 * Desktop while the desktop window still fits at 80 % or more, mobile below that. With today's 782 x 596 footprint
 * that means mobile under 650 CSS px wide or 501 tall: every phone in either orientation, but not a tablet or a
 * laptop window.
 */
export const layoutMode = (width: number, height: number, footprint: Footprint): LayoutMode =>
  desktopScale(width, height, footprint) < MIN_DESKTOP_SCALE ? "mobile" : "desktop";

/**
 * Packs `count` profession tabs into a strip `width` wide. One row while each tab gets at least `minCell` (full
 * size, `maxCell`, when there is room), otherwise two rows, shrinking the cells so every tab stays on screen.
 * `cell` is the square each tab takes, gap included.
 */
export const stripLayout = (count: number, width: number, maxCell: number, minCell: number): {
  perRow: number; rows: number; cell: number;
} => {
  const tabs = Math.max(1, count);
  if (tabs * minCell <= width) {
    return { perRow: tabs, rows: 1, cell: Math.min(maxCell, Math.floor(width / tabs)) };
  }
  const perRow = Math.ceil(tabs / 2);
  return { perRow, rows: 2, cell: Math.min(maxCell, Math.floor(width / perRow)) };
};

/**
 * How far to move the content up so a field spanning `top`..`bottom` sits inside the visible band
 * `visibleTop`..`visibleBottom` (all in layout-viewport px), with `margin` to spare. When the band is too short for
 * the whole field, its top stays visible. Zero when it already fits, for example when the browser panned to it.
 */
export const keyboardShift = (
  top: number, bottom: number, visibleTop: number, visibleBottom: number, margin: number,
): number => {
  const overflow = bottom + margin - visibleBottom;
  if (overflow <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(overflow, top - margin - visibleTop));
};
