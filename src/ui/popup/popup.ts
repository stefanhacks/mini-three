import { Container } from "pixi.js";
import type { Store } from "../../app/store";
import type { ProfessionKey } from "../../data";
import { PROFESSION_ICONS, itemOf, professionByKey, recipeKey, recipesByProfession } from "../../data/model";
import {
  type ArtKit, FRAME_TITLE_HEIGHT, SHADOW_SPREAD, TAB_GLOW, TEXT_STYLES, createNineSlice, createStoneOverlay,
} from "../art";
import { at, button, itemSlot, label, piece, roundIcon } from "../widgets";
import { createDetailPane } from "./detail";
import { createPicker } from "./picker";
import { buildRows } from "./rows";
import { createScrollList } from "./scrollList";

export const WINDOW_WIDTH = 720;
export const WINDOW_HEIGHT = 580;
/** Width the side tabs add to the right of the window. */
export const TABS_WIDTH = 48 + TAB_GLOW * 2 - 10;

const TAB_SIZE = 48;
const TAB_STEP = 54;
const TABS_TOP = 52;
const LIST_WIDTH = 290;
const CONTENT_TOP = 74;
const PORTRAIT = 72;

/**
 * The profession window: frame, portrait, title, a summary bar, the side tabs for the chosen professions, and either
 * the picker or the list and detail panes. It renders from the store and writes user actions back to it.
 */
export const createPopup = (kit: ArtKit, store: Store): Container => {
  const w = WINDOW_WIDTH;
  const h = WINDOW_HEIGHT;
  const win = new Container();
  win.addChild(at(piece(kit, "frameShadow", w + SHADOW_SPREAD * 2, h + SHADOW_SPREAD * 2), -SHADOW_SPREAD,
    -SHADOW_SPREAD + 6));
  const tabs = new Container();
  win.addChild(tabs);
  win.addChild(piece(kit, "frame", w, h));
  win.addChild(at(createStoneOverlay(kit, w - 10, h - FRAME_TITLE_HEIGHT - 5, 0.8), 5, FRAME_TITLE_HEIGHT));
  const title = label("", TEXT_STYLES.title, w / 2, FRAME_TITLE_HEIGHT / 2 + 1, 0.5);
  win.addChild(title);

  // Portrait medallion: the active profession's icon in the corner ring.
  win.addChild(at(piece(kit, "portraitBack"), -16, -16));
  const portrait = at(new Container(), -16 + 10, -16 + 10);
  win.addChild(portrait);
  win.addChild(at(piece(kit, "portraitRing"), -16, -16));

  // Summary bar: recipe and gatherable counts. Stage 4 turns it into known-recipe progress.
  const barX = 120;
  const barW = 440;
  win.addChild(at(piece(kit, "barTrack", barW, 18), barX, 42));
  const barText = label("", TEXT_STYLES.bar, barX + barW / 2, 51, 0.5);
  win.addChild(barText);

  const contentHeight = h - CONTENT_TOP - 44;
  const list = createScrollList(kit, LIST_WIDTH, contentHeight - 32, {
    onSelect: (row) => {
      if (row.kind === "recipe") {
        store.set({ selection: { kind: "recipe", recipe: row.recipe } });
      } else if (row.kind === "item") {
        store.set({ selection: { kind: "item", itemId: row.itemId } });
      }
    },
    onToggle: (id) => {
      const collapsed = new Set(store.get().collapsed);
      if (collapsed.has(id)) {
        collapsed.delete(id);
      } else {
        collapsed.add(id);
      }
      store.set({ collapsed });
    },
  });
  const detail = createDetailPane(kit, w - LIST_WIDTH - 40, contentHeight,
    (itemId) => store.set({ selection: { kind: "item", itemId } }));
  const browse = new Container();
  browse.addChild(at(list.view, 16, CONTENT_TOP + 32));
  browse.addChild(at(detail.view, LIST_WIDTH + 24, CONTENT_TOP));
  // The list's top strip, where the game has search and filter, shows which tab is open.
  const listCaption = label("", TEXT_STYLES.header, 20, CONTENT_TOP + 14);
  browse.addChild(listCaption);
  win.addChild(browse);

  const picker = createPicker(kit, w - 32, contentHeight, (chosen) => {
    const { active } = store.get();
    store.set({
      chosen,
      active: active && chosen.includes(active) ? active : chosen[0],
      view: "list",
    });
  });
  win.addChild(at(picker.view, 16, CONTENT_TOP));

  const professionsButton = button(kit, "Professions", 120, () => {
    picker.open(store.get().chosen);
    store.set({ view: "picker" });
  });
  win.addChild(at(professionsButton.view, w - 16 - 120, h - 34));

  const renderTabs = (chosen: ProfessionKey[], active: ProfessionKey | null) => {
    tabs.removeChildren().forEach((child) => child.destroy({ children: true }));
    const step = Math.min(TAB_STEP, Math.floor((h - TABS_TOP - 20) / Math.max(1, chosen.length)));
    const scale = Math.min(1, step / TAB_STEP);
    chosen.forEach((key, i) => {
      const isActive = key === active;
      const tab = new Container();
      tab.addChild(at(createNineSlice(kit.pieces[isActive ? "tabActive" : "tab"], TAB_SIZE + TAB_GLOW * 2,
        TAB_SIZE + TAB_GLOW * 2), -TAB_GLOW, -TAB_GLOW));
      tab.addChild(at(itemSlot(kit, PROFESSION_ICONS[key], 36), 10, 6));
      tab.scale.set(scale);
      tab.eventMode = "static";
      tab.cursor = "pointer";
      tab.on("pointertap", () => store.set({ active: key, selection: null, view: "list" }));
      tabs.addChild(at(tab, w - 10 + (isActive ? 2 : 0), TABS_TOP + i * step));
    });
  };

  let renderedProfession: ProfessionKey | null = null;

  const render = () => {
    const state = store.get();
    renderTabs(state.chosen, state.active);
    const inPicker = state.view === "picker" || !state.active;
    picker.view.visible = inPicker;
    browse.visible = !inPicker;
    professionsButton.view.visible = !inPicker;

    const profession = state.active ? professionByKey.get(state.active) : undefined;
    portrait.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (inPicker || !profession) {
      title.text = "Professions";
      barText.text = `${state.chosen.length} of 14 chosen`;
      return;
    }
    portrait.addChild(roundIcon(PROFESSION_ICONS[profession.key], PORTRAIT - 20));
    title.text = profession.name;
    const recipes = recipesByProfession.get(profession.key) ?? [];
    barText.text = [
      recipes.length > 0 ? `${recipes.length} recipes` : "",
      profession.gatherables.length > 0 ? `${profession.gatherables.length} gatherables` : "",
    ].filter(Boolean).join("  ·  ");
    listCaption.text = profession.name;

    const rows = buildRows(profession, state.collapsed, { recipes, itemOf, recipeKey });
    list.setRows(rows, renderedProfession !== profession.key);
    renderedProfession = profession.key;
    const selection = state.selection;
    list.setSelected(!selection ? null : selection.kind === "recipe" ? recipeKey(selection.recipe)
      : `item:${selection.itemId}`);
    detail.show(selection);
  };

  store.subscribe(render);
  if (store.get().view === "picker") {
    picker.open(store.get().chosen);
  }
  render();
  return win;
};
