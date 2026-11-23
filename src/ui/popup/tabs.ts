import { Container, Graphics, Rectangle } from "pixi.js";
import type { ProfessionKey } from "../../data";
import { PROFESSION_KEYS, TAB_GROUPS } from "../../data/keys";
import { PROFESSION_ICONS, professionByKey } from "../../data/model";
import { type ArtKit, PALETTE, TAB_GLOW, createNineSlice } from "../art";
import { at, clearChildren, itemSlot, tappable } from "../widgets";
import { MIN_TIER_GAP, type Strip, TAB_SIZE, TAB_STEP, TAB_TUCK, TIER_GAP } from "./geometry";

const TABS_TOP = 52;
const TAB_ICON = 36;
/** Group index of each tab. */
const GROUP_OF = new Map(TAB_GROUPS.flatMap((keys, group) => keys.map((key) => [key, group] as const)));

export interface Tabs {
  view: Container;
  /** Redraws the tabs with `active` highlighted. */
  render: (active: ProfessionKey) => void;
}

/**
 * The five profession tabs. Desktop (`strip` null): down the window's right side, tucked under the frame, a gap
 * between groups. Mobile: square tabs in `strip`, under the title.
 */
export const createTabs = (
  kit: ArtKit, frame: { w: number; h: number }, strip: Strip | null, onPress: (key: ProfessionKey) => void,
): Tabs => {
  const view = new Container();

  /** One profession tab: gold when active, bronze-rimmed when primary, grey otherwise. */
  const tab = (key: ProfessionKey, active: ProfessionKey, iconX: number): Container => {
    const primary = professionByKey.get(key)?.tier === "primary";
    const tabView = new Container();
    tabView.addChild(at(createNineSlice(kit.pieces[key === active ? "tabActive" : primary ? "tabPrimary" : "tab"],
      TAB_SIZE + TAB_GLOW * 2, TAB_SIZE + TAB_GLOW * 2), -TAB_GLOW, -TAB_GLOW));
    tabView.addChild(at(itemSlot(kit, PROFESSION_ICONS[key], TAB_ICON), iconX, 6));
    return tappable(tabView, () => onPress(key));
  };

  const renderSide = (active: ProfessionKey) => {
    const count = PROFESSION_KEYS.length;
    const gaps = TAB_GROUPS.length - 1;
    const step = Math.min(TAB_STEP, Math.floor((frame.h - TABS_TOP - 20 - TIER_GAP * gaps) / count));
    const scale = Math.min(1, step / TAB_STEP);
    PROFESSION_KEYS.forEach((key, i) => {
      // The icon sits as far from the flap's right edge as from its top and bottom.
      const tabView = tab(key, active, TAB_SIZE - TAB_ICON - 6);
      tabView.scale.set(scale);
      const y = TABS_TOP + i * step + (GROUP_OF.get(key) ?? 0) * TIER_GAP;
      view.addChild(at(tabView, frame.w - TAB_TUCK + (key === active ? 2 : 0), y));
    });
  };

  /**
   * Centred, a gap between groups. On one row the gaps grow (up to a tab's width) so the tabs spread across the
   * frame. On two rows, the primary tabs take the first and the rest the second.
   */
  const renderStrip = (active: ProfessionKey, { x: left, y: top, w, cell, perRow }: Strip) => {
    const scale = cell / TAB_STEP;
    const inset = (TAB_STEP - TAB_SIZE) / 2;
    const oneRow = perRow >= PROFESSION_KEYS.length;
    const rows = oneRow ? [TAB_GROUPS] : [TAB_GROUPS.slice(0, 1), TAB_GROUPS.slice(1)];
    rows.forEach((groups, row) => {
      const cells = groups.flat().length;
      const gaps = groups.length - 1;
      const gap = gaps === 0 ? 0 : oneRow
        ? Math.min(cell, Math.max(MIN_TIER_GAP, Math.floor((w - cells * cell) / gaps))) : TIER_GAP;
      let x = left + Math.round((w - cells * cell - gaps * gap) / 2);
      groups.forEach((keys, group) => {
        if (group > 0) {
          // A dot in the secondary tabs' grey marks the gap between groups (gold means primary).
          const dot = new Graphics().circle(0, 0, 2.5).fill(PALETTE.grey.light);
          view.addChild(at(dot, Math.round(x + gap / 2), top + (row + 0.5) * cell));
          x += gap;
        }
        keys.forEach((key) => {
          const tabView = tab(key, active, 6);
          tabView.scale.set(scale);
          // The whole cell, gap included, takes the tap.
          tabView.hitArea = new Rectangle(-inset, -inset, TAB_STEP, TAB_STEP);
          view.addChild(at(tabView, x + inset * scale, top + (row * TAB_STEP + inset) * scale));
          x += cell;
        });
      });
    });
  };

  return {
    view,
    render: (active) => {
      clearChildren(view);
      if (strip) {
        renderStrip(active, strip);
      } else {
        renderSide(active);
      }
    },
  };
};
