import { Container, type FederatedPointerEvent, type FederatedWheelEvent, Graphics, Rectangle, type Ticker }
  from "pixi.js";
import type { ProfessionKey } from "../../data";
import { PROFESSION_GROUPS, PROFESSION_ICONS, professionByKey } from "../../data/model";
import { type ArtKit, TEXT_STYLES, createStoneOverlay } from "../art";
import { at, button, checkbox, itemSlot, label, piece } from "../widgets";
import { createDragScroll } from "./dragScroll";

export interface Picker {
  view: Container;
  /** Syncs the toggles with the current choice when the picker opens. */
  open: (chosen: ProfessionKey[]) => void;
  /** The toggles as they are now, saved or not, to carry them into a rebuilt picker. */
  current: () => ProfessionKey[];
}

const PAD = 24;
/** Side padding on narrow (phone) pickers. */
const NARROW_PAD = 12;
const ROW = 44;
const COLUMN = 210;
/** A column needs this much room; narrower pickers get fewer columns and stack the groups. */
const MIN_COLUMN = 160;
const GROUP_GAP = 12;
const HEADER = 22;
const WHEEL_LINE = 20;

/**
 * The profession picker: toggles grouped as Crafting, Gathering and Secondary, and a Done button. The groups get a
 * column each when the picker is wide enough, otherwise they stack into fewer columns; when they still don't fit
 * the height, they scroll (drag, fling or wheel) above the Done button, which never moves.
 */
export const createPicker = (
  kit: ArtKit, width: number, height: number, onDone: (chosen: ProfessionKey[]) => void, ticker: Ticker,
): Picker => {
  const view = new Container();
  view.addChild(piece(kit, "paneDetail", width, height));
  view.addChild(at(createStoneOverlay(kit, width - 2, height - 2, 0.5), 1, 1));
  view.addChild(label("Choose your professions", TEXT_STYLES.itemName, width / 2, PAD + 4, 0.5));

  const columns = Math.max(1, Math.min(PROFESSION_GROUPS.length, Math.floor((width - NARROW_PAD * 2) / MIN_COLUMN)));
  const padX = columns < PROFESSION_GROUPS.length ? NARROW_PAD : PAD;
  const step = Math.min(COLUMN, Math.floor((width - padX * 2) / columns));
  // Narrow columns get a smaller icon so the longest names still fit beside it.
  const compact = step < 200;

  const subtitle = label("Only the professions you pick get a tab. You can change this at any time.", TEXT_STYLES.muted,
    width / 2, PAD + 28, 0.5);
  const lineHeight = subtitle.height;
  if (subtitle.width > width - padX * 2) {
    subtitle.style = subtitle.style.clone();
    subtitle.style.wordWrap = true;
    subtitle.style.wordWrapWidth = width - padX * 2;
    subtitle.style.align = "center";
    subtitle.anchor.set(0.5, 0);
    subtitle.y = PAD + 28 - lineHeight / 2;
  }
  view.addChild(subtitle);

  const selected = new Set<ProfessionKey>();
  const done = button(kit, "Done", 120, () => {
    const order = PROFESSION_GROUPS.flatMap((group) => group.keys);
    onDone(order.filter((key) => selected.has(key)));
  });
  const toggles = new Map<ProfessionKey, (checked: boolean) => void>();

  const list = new Container();
  view.addChild(list);
  const top = PAD + 64 + Math.round(subtitle.height - lineHeight);
  const left = Math.round((width - step * columns) / 2);
  // Each group goes to the column that is shortest so far, so two columns hold Crafting | Gathering + Secondary.
  const columnBottoms = Array.from({ length: columns }, () => top);
  PROFESSION_GROUPS.forEach((group) => {
    const column = columnBottoms.indexOf(Math.min(...columnBottoms));
    const x = left + column * step;
    const groupTop = columnBottoms[column];
    columnBottoms[column] = groupTop + HEADER + group.keys.length * ROW + GROUP_GAP;
    list.addChild(label(group.title, TEXT_STYLES.header, x, groupTop));
    group.keys.forEach((key, i) => {
      const y = groupTop + HEADER + i * ROW;
      const row = at(new Container(), x, y);
      const toggle = checkbox(kit, "", TEXT_STYLES.row, (checked) => {
        if (checked) {
          selected.add(key);
        } else {
          selected.delete(key);
        }
        done.setEnabled(selected.size > 0);
      });
      row.addChild(at(toggle.view, 0, 10));
      row.addChild(compact ? at(itemSlot(kit, PROFESSION_ICONS[key], 32), 26, 4)
        : at(itemSlot(kit, PROFESSION_ICONS[key], 36), 28, 2));
      row.addChild(label(professionByKey.get(key)?.name ?? key, TEXT_STYLES.row, compact ? 64 : 74, 20));
      // The icon, the name and the space after it toggle too, not just the box.
      row.hitArea = new Rectangle(0, 0, step - 8, ROW - 4);
      row.eventMode = "static";
      row.cursor = "pointer";
      row.on("pointertap", (event) => {
        if (!toggle.view.getBounds().containsPoint(event.global.x, event.global.y)) {
          toggle.view.emit("pointertap", event);
        }
      });
      toggles.set(key, (checked) => {
        toggle.set(checked);
      });
      list.addChild(row);
    });
  });

  const doneY = height - PAD - 24;
  view.addChild(at(done.view, (width - 120) / 2, doneY));

  // Too tall for the space above Done: the groups scroll inside a masked band.
  const bandTop = top - HEADER / 2 - 4;
  const bandHeight = doneY - 10 - bandTop;
  const overflow = Math.max(...columnBottoms) - GROUP_GAP - bandTop - bandHeight;
  if (overflow > 0) {
    const mask = new Graphics().rect(0, bandTop, width, bandHeight).fill(0xffffff);
    view.addChild(mask);
    list.mask = mask;
    let scroll = 0;
    const scrollTo = (value: number) => {
      scroll = Math.min(Math.max(0, value), overflow + 8);
      list.y = -Math.round(scroll);
    };
    const area = new Container();
    area.hitArea = new Rectangle(0, bandTop, width, bandHeight);
    area.eventMode = "static";
    view.addChildAt(area, 2);
    const drag = createDragScroll(view, ticker, { get: () => scroll, set: scrollTo }, list);
    list.eventMode = "static";
    area.on("pointerdown", (event: FederatedPointerEvent) => drag.press(event));
    list.on("pointerdown", (event: FederatedPointerEvent) => drag.press(event));
    view.eventMode = "static";
    view.on("wheel", (event: FederatedWheelEvent) => {
      drag.stop();
      scrollTo(scroll + (event.deltaMode === 1 ? event.deltaY * WHEEL_LINE : event.deltaY));
    });
  }

  return {
    view,
    open: (chosen) => {
      selected.clear();
      chosen.forEach((key) => selected.add(key));
      toggles.forEach((set, key) => set(selected.has(key)));
      done.setEnabled(selected.size > 0);
    },
    current: () => PROFESSION_GROUPS.flatMap((group) => group.keys).filter((key) => selected.has(key)),
  };
};
