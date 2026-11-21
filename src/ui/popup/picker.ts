import { Container } from "pixi.js";
import type { ProfessionKey } from "../../data";
import { PROFESSION_GROUPS, PROFESSION_ICONS, professionByKey } from "../../data/model";
import { type ArtKit, TEXT_STYLES, createStoneOverlay } from "../art";
import { at, button, checkbox, itemSlot, label, piece } from "../widgets";

export interface Picker {
  view: Container;
  /** Syncs the toggles with the current choice when the picker opens. */
  open: (chosen: ProfessionKey[]) => void;
}

const PAD = 24;
const ROW = 44;
const COLUMN = 210;

/** The profession picker: toggles grouped as Crafting, Gathering and Secondary, and a Done button. */
export const createPicker = (
  kit: ArtKit, width: number, height: number, onDone: (chosen: ProfessionKey[]) => void,
): Picker => {
  const view = new Container();
  view.addChild(piece(kit, "paneDetail", width, height));
  view.addChild(at(createStoneOverlay(kit, width - 2, height - 2, 0.5), 1, 1));
  view.addChild(label("Choose your professions", TEXT_STYLES.itemName, width / 2, PAD + 4, 0.5));
  view.addChild(label("Only the professions you pick get a tab. You can change this at any time.", TEXT_STYLES.muted,
    width / 2, PAD + 28, 0.5));

  const selected = new Set<ProfessionKey>();
  const done = button(kit, "Done", 120, () => {
    const order = PROFESSION_GROUPS.flatMap((group) => group.keys);
    onDone(order.filter((key) => selected.has(key)));
  });
  const toggles = new Map<ProfessionKey, (checked: boolean) => void>();

  const left = Math.round((width - COLUMN * PROFESSION_GROUPS.length) / 2);
  PROFESSION_GROUPS.forEach((group, column) => {
    const x = left + column * COLUMN;
    const top = PAD + 64;
    view.addChild(label(group.title, TEXT_STYLES.header, x, top));
    group.keys.forEach((key, i) => {
      const y = top + 22 + i * ROW;
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
      row.addChild(at(itemSlot(kit, PROFESSION_ICONS[key], 36), 28, 2));
      row.addChild(label(professionByKey.get(key)?.name ?? key, TEXT_STYLES.row, 74, 20));
      // The icon and name toggle too, not just the box.
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
      view.addChild(row);
    });
  });

  view.addChild(at(done.view, (width - 120) / 2, height - PAD - 24));

  return {
    view,
    open: (chosen) => {
      selected.clear();
      chosen.forEach((key) => selected.add(key));
      toggles.forEach((set, key) => set(selected.has(key)));
      done.setEnabled(selected.size > 0);
    },
  };
};
