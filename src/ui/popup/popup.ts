import { Container, Graphics, Rectangle, type Ticker } from "pixi.js";
import type { Store } from "../../app/store";
import type { ProfessionKey } from "../../data";
import { PROFESSION_ICONS, itemOf, professionByKey, recipeKey, recipesByProfession } from "../../data/model";
import {
  type ArtKit, FRAME_TITLE_HEIGHT, PALETTE, SHADOW_SPREAD, TAB_GLOW, TEXT_STYLES, createNineSlice,
  createStoneOverlay,
} from "../art";
import { keyboardShift, stripLayout } from "../layout";
import { SLIDE_MS, tweenAt } from "../motion";
import { at, button, checkbox, iconSprite, itemSlot, label, piece, roundIcon } from "../widgets";
import { createDetailPane } from "./detail";
import { NOTES_TEXT_SIZE, NOTES_TEXT_SIZE_MOBILE, type NotesField } from "./notesField";
import { createPicker } from "./picker";
import { DESKTOP_ROWS, type RowMetrics, TOUCH_ROWS, buildRows } from "./rows";
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

// Mobile frame, in its own coordinates. The medallion shrinks to sit inside the title corner; everything below the
// title strip is content.
const MOBILE_PAD = 12;
const MOBILE_CONTENT_TOP = 42;
const MOBILE_PORTRAIT_SCALE = 0.66;
export const MOBILE_BUTTON_HEIGHT = 28;
const BACK_X = 48;
const BACK_WIDTH = 72;
/** From this frame width, the summary bar fits between Known only and Professions instead of taking its own row. */
const WIDE_FRAME = 560;
/** Smallest tab cell in the mobile strip, still a comfortable touch target. */
const MIN_TAB_CELL = 44;
const SHORT_FRAME = 420;
/** Room kept between the notes field and the top of the on-screen keyboard. */
const KEYBOARD_MARGIN = 8;

/** Desktop: the fixed-size window, scaled by main.ts. Mobile: a frame of the given size, at scale 1. */
export type PopupLayout = { mode: "desktop" } | { mode: "mobile"; width: number; height: number };

export interface PopupEnv {
  ticker: Ticker;
  /** The DOM notes field. It outlives popups, so a rebuild keeps its text, caret and focus. */
  notesField: NotesField;
  layout: PopupLayout;
}

/** View state that is not in the store, handed from a popup to the one rebuilt in its place. */
export interface PopupCarry {
  profession: ProfessionKey | null;
  /** List position in rows, so it survives a change of row height. */
  listPosition: number;
  /** The picker's unsaved toggles, when it was open. */
  picked: ProfessionKey[] | null;
}

export interface Popup {
  view: Container;
  carry: () => PopupCarry;
  destroy: () => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Geometry {
  w: number;
  h: number;
  portrait: { x: number; y: number; scale: number };
  bar: Box;
  knownOnly: { x: number; y: number };
  list: Box;
  detail: Box;
  picker: Box;
  professions: Box;
  /** The mobile tab strip; desktop has side tabs instead. */
  strip: (Box & { perRow: number; cell: number }) | null;
  rows: RowMetrics;
}

const desktopGeometry = (): Geometry => {
  const w = WINDOW_WIDTH;
  const h = WINDOW_HEIGHT;
  const contentHeight = h - CONTENT_TOP - 44;
  return {
    w,
    h,
    portrait: { x: -16, y: -16, scale: 1 },
    bar: { x: 120, y: 42, w: 440, h: 18 },
    knownOnly: { x: 20, y: CONTENT_TOP + 6 },
    list: { x: 16, y: CONTENT_TOP + 32, w: LIST_WIDTH, h: contentHeight - 32 },
    detail: { x: LIST_WIDTH + 24, y: CONTENT_TOP, w: w - LIST_WIDTH - 40, h: contentHeight },
    picker: { x: 16, y: CONTENT_TOP, w: w - 32, h: contentHeight },
    professions: { x: w - 16 - 120, y: h - 34, w: 120, h: 24 },
    strip: null,
    rows: DESKTOP_ROWS,
  };
};

/**
 * The mobile frame, top to bottom: title strip (portrait, Back, title), the tab strip, the summary bar, a row with
 * Known only and Professions (the bar joins that row on wide frames), and the list down to the bottom. The detail
 * pane and the picker cover everything under the title strip.
 */
const mobileGeometry = (w: number, h: number, tabCount: number): Geometry => {
  const inner = w - MOBILE_PAD * 2;
  // Short (landscape) frames get slightly smaller tabs: their height goes to the list.
  const tabs = stripLayout(tabCount, inner, h < SHORT_FRAME ? MIN_TAB_CELL : TAB_STEP, MIN_TAB_CELL);
  const strip = { x: MOBILE_PAD, y: MOBILE_CONTENT_TOP + 2, w: inner, h: tabs.rows * tabs.cell, perRow: tabs.perRow,
    cell: tabs.cell };
  const wide = w >= WIDE_FRAME;
  const barRow = strip.y + strip.h + 6;
  const controlsY = wide ? barRow : barRow + 18 + 6;
  const bar = wide ? { x: MOBILE_PAD + 130, y: controlsY + 5, w: inner - 260, h: 18 }
    : { x: MOBILE_PAD, y: barRow, w: inner, h: 18 };
  const listY = controlsY + MOBILE_BUTTON_HEIGHT + 6;
  const cover = { x: MOBILE_PAD, y: MOBILE_CONTENT_TOP, w: inner, h: h - MOBILE_PAD - MOBILE_CONTENT_TOP };
  return {
    w,
    h,
    portrait: { x: -6, y: -6, scale: MOBILE_PORTRAIT_SCALE },
    bar,
    knownOnly: { x: MOBILE_PAD + 4, y: controlsY + 4 },
    list: { x: MOBILE_PAD, y: listY, w: inner, h: h - MOBILE_PAD - listY },
    detail: cover,
    picker: cover,
    professions: { x: w - MOBILE_PAD - 120, y: controlsY, w: 120, h: MOBILE_BUTTON_HEIGHT },
    strip,
    rows: TOUCH_ROWS,
  };
};

/**
 * The profession window: frame, portrait, title, a summary bar, tabs for the chosen professions, and either the
 * picker or the list and detail panes. It renders from the store and writes user actions back to it.
 *
 * Desktop is the fixed window with side tabs and the list and detail side by side. Mobile fills the screen: the
 * tabs become a strip under the title, the list takes the full width, and selecting an entry slides the detail
 * pane in over it from the right, with a Back button in the title strip.
 */
export const createPopup = (kit: ArtKit, store: Store, env: PopupEnv, carry?: PopupCarry): Popup => {
  const { ticker, notesField, layout } = env;
  const mobile = layout.mode === "mobile";
  const g = layout.mode === "mobile" ? mobileGeometry(layout.width, layout.height, store.get().chosen.length)
    : desktopGeometry();
  const { w, h } = g;
  const win = new Container();
  win.addChild(at(piece(kit, "frameShadow", w + SHADOW_SPREAD * 2, h + SHADOW_SPREAD * 2), -SHADOW_SPREAD,
    -SHADOW_SPREAD + 6));
  const tabs = new Container();
  if (!mobile) {
    win.addChild(tabs);
  }
  win.addChild(piece(kit, "frame", w, h));
  win.addChild(at(createStoneOverlay(kit, w - 10, h - FRAME_TITLE_HEIGHT - 5, 0.8), 5, FRAME_TITLE_HEIGHT));
  const title = label("", TEXT_STYLES.title, w / 2, FRAME_TITLE_HEIGHT / 2 + 1, 0.5);
  win.addChild(title);

  // Portrait medallion: the active profession's icon in the corner ring.
  const medallion = at(new Container(), g.portrait.x, g.portrait.y);
  medallion.scale.set(g.portrait.scale);
  medallion.addChild(piece(kit, "portraitBack"));
  const portrait = at(new Container(), 10, 10);
  medallion.addChild(portrait);
  medallion.addChild(piece(kit, "portraitRing"));
  win.addChild(medallion);

  // Summary bar: known-recipe progress and the gatherable count.
  const barTrack = at(piece(kit, "barTrack", g.bar.w, g.bar.h), g.bar.x, g.bar.y);
  const barText = label("", TEXT_STYLES.bar, g.bar.x + g.bar.w / 2, g.bar.y + 9, 0.5);
  if (!mobile) {
    win.addChild(barTrack, barText);
  }

  const list = createScrollList(kit, g.list.w, g.list.h, {
    onSelect: (row) => {
      if (row.kind === "recipe") {
        store.set({ selection: { kind: "recipe", recipe: row.recipe }, detailOpen: true });
      } else if (row.kind === "item") {
        store.set({ selection: { kind: "item", itemId: row.itemId }, detailOpen: true });
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
  }, ticker, g.rows);
  const detail = createDetailPane(kit, g.detail.w, g.detail.h, ticker, {
    onSelectItem: (itemId) => store.set({ selection: { kind: "item", itemId }, detailOpen: true }),
    onToggleKnown: (recipe, isKnown) => {
      const known = new Set(store.get().known);
      if (isKnown) {
        known.add(recipeKey(recipe));
      } else {
        known.delete(recipeKey(recipe));
      }
      store.set({ known });
    },
    // Editing arrives in stage 2 of docs/PLAN-inline-notes.md; until then the note is read-only.
    onEditNote: () => undefined,
  });
  const knownOnlyBox = checkbox(kit, "Known only", TEXT_STYLES.row,
    (knownOnly) => store.set({ knownOnly }), store.get().knownOnly);
  const professionsButton = button(kit, "Professions", g.professions.w, () => {
    picker.open(store.get().chosen);
    store.set({ view: "picker", detailOpen: false });
  }, g.professions.h);

  const browse = new Container();
  // Mobile: everything the detail pane covers, hidden while it is fully open.
  const under = new Container();
  const slider = new Container();
  if (mobile) {
    under.addChild(tabs, barTrack, barText);
    under.addChild(at(list.view, g.list.x, g.list.y));
    under.addChild(at(knownOnlyBox.view, g.knownOnly.x, g.knownOnly.y));
    under.addChild(at(professionsButton.view, g.professions.x, g.professions.y));
    // A finger-sized target around the small box.
    knownOnlyBox.view.hitArea = new Rectangle(-8, -8, knownOnlyBox.view.width + 16, 36);
    browse.addChild(under);
    // The pane slides in from under the frame's right edge; the mask hides it outside the frame.
    slider.addChild(at(detail.view, g.detail.x, g.detail.y));
    const sliderMask = new Graphics().rect(5, FRAME_TITLE_HEIGHT, w - 10, h - FRAME_TITLE_HEIGHT - 5).fill(0xffffff);
    slider.mask = sliderMask;
    browse.addChild(slider, sliderMask);
    // Taps on the pane must not reach the list under it.
    detail.view.eventMode = "static";
    detail.view.hitArea = new Rectangle(0, 0, g.detail.w, g.detail.h);
  } else {
    browse.addChild(at(list.view, g.list.x, g.list.y));
    browse.addChild(at(detail.view, g.detail.x, g.detail.y));
    // The list's top strip, where the game has search and filter, holds the known-only filter.
    browse.addChild(at(knownOnlyBox.view, g.knownOnly.x, g.knownOnly.y));
  }
  win.addChild(browse);

  const picker = createPicker(kit, g.picker.w, g.picker.h, (chosen) => {
    const { active } = store.get();
    const next = active && chosen.includes(active) ? active : chosen[0];
    // A different profession means the open entry belongs to one no longer shown: clear it.
    store.set(next === active
      ? { chosen, active: next, view: "list" }
      : { chosen, active: next, view: "list", selection: null, detailOpen: false });
  }, ticker);
  win.addChild(at(picker.view, g.picker.x, g.picker.y));

  if (!mobile) {
    win.addChild(at(professionsButton.view, g.professions.x, g.professions.y));
  }

  const back = button(kit, "Back", BACK_WIDTH, () => store.set({ detailOpen: false }), 22);
  // Always in the tree, hidden on desktop: a button left outside it is never destroyed with the popup, and its
  // caption's listener on the shared text style would keep every rebuilt desktop popup alive.
  win.addChild(at(back.view, BACK_X, (FRAME_TITLE_HEIGHT - 22) / 2));
  back.view.visible = false;
  if (mobile) {
    const chevron = iconSprite(kit.icons.chevronRight, 13, 11, PALETTE.text.header);
    chevron.scale.x = -1;
    back.view.addChild(chevron);
  }

  const tabPressed = (key: ProfessionKey) => store.set({ active: key, selection: null, detailOpen: false,
    view: "list" });

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
      tab.on("pointertap", () => tabPressed(key));
      tabs.addChild(at(tab, w - 10 + (isActive ? 2 : 0), TABS_TOP + i * step));
    });
  };

  /** Mobile: the chosen professions as square tabs in one or two rows, left to right. */
  const renderStrip = (chosen: ProfessionKey[], active: ProfessionKey | null) => {
    tabs.removeChildren().forEach((child) => child.destroy({ children: true }));
    const strip = g.strip;
    if (!strip) {
      return;
    }
    const scale = strip.cell / TAB_STEP;
    const inset = (TAB_STEP - TAB_SIZE) / 2;
    chosen.forEach((key, i) => {
      const tab = new Container();
      tab.addChild(at(createNineSlice(kit.pieces[key === active ? "tabActive" : "tab"], TAB_SIZE + TAB_GLOW * 2,
        TAB_SIZE + TAB_GLOW * 2), -TAB_GLOW, -TAB_GLOW));
      tab.addChild(at(itemSlot(kit, PROFESSION_ICONS[key], 36), 6, 6));
      tab.scale.set(scale);
      tab.eventMode = "static";
      tab.cursor = "pointer";
      // The whole cell, gap included, takes the tap.
      tab.hitArea = new Rectangle(-inset, -inset, TAB_STEP, TAB_STEP);
      tab.on("pointertap", () => tabPressed(key));
      tabs.addChild(at(tab, strip.x + ((i % strip.perRow) * TAB_STEP + inset) * scale,
        strip.y + (Math.floor(i / strip.perRow) * TAB_STEP + inset) * scale));
    });
  };

  // Mobile slide: the pane's x offset, 0 when open, the frame width when out of sight. A ticker listener runs
  // only while it moves.
  const away = w;
  let slideX = away;
  let tween: { from: number; to: number; elapsed: number } | null = null;
  const applySlide = () => {
    slider.x = Math.round(slideX);
    slider.visible = slideX < away;
    under.visible = slideX > 0;
    // The textarea can't follow the pane smoothly; it shows once the pane has settled.
    notesField.setVisible(slideX === 0);
  };
  const slideStep = (t: Ticker) => {
    if (!tween) {
      return;
    }
    tween.elapsed += t.deltaMS;
    slideX = tweenAt(tween.from, tween.to, tween.elapsed, SLIDE_MS);
    if (tween.elapsed >= SLIDE_MS) {
      slideX = tween.to;
      tween = null;
      ticker.remove(slideStep);
    }
    applySlide();
  };
  const slideTo = (open: boolean, animate: boolean) => {
    const to = open ? 0 : away;
    if (!animate) {
      tween = null;
      ticker.remove(slideStep);
      slideX = to;
      applySlide();
      return;
    }
    if ((tween ? tween.to : slideX) === to) {
      return;
    }
    if (!tween) {
      ticker.add(slideStep);
    }
    // A reversal mid-way starts from where the pane is, so it never jumps.
    tween = { from: slideX, to, elapsed: 0 };
  };

  // Mobile on-screen keyboard: the visible band of the layout viewport, from `visualViewport`. While the notes
  // field has focus and the keyboard covers it, the whole frame moves up (through its pivot) just enough.
  const viewport = mobile ? window.visualViewport : null;
  let band = { top: 0, bottom: window.innerHeight };
  const readBand = () => {
    band = viewport ? { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height }
      : { top: 0, bottom: window.innerHeight };
  };
  // iOS may scroll the page to show a focused field; put it back when the keyboard closes.
  const resetScroll = () => window.scrollTo(0, 0);
  if (mobile) {
    readBand();
    viewport?.addEventListener("resize", readBand);
    viewport?.addEventListener("scroll", readBand);
    notesField.element.addEventListener("focusout", resetScroll);
  }
  let shift = 0;

  // The notes live in a DOM textarea over the detail pane. It is moved to the pane's screen rectangle every frame
  // (cheap when nothing moved), so it follows the popup's scale and the window size.
  notesField.setTextSize(mobile ? NOTES_TEXT_SIZE_MOBILE : NOTES_TEXT_SIZE);
  notesField.setVisible(true);
  detail.view.onRender = () => {
    const box = detail.noteBox();
    if (!box) {
      return;
    }
    const { x, y, width, height } = box;
    if (mobile) {
      // Mobile runs at scale 1, so the field's unshifted top is plain arithmetic.
      const top = win.y + g.detail.y + y;
      const focused = document.activeElement === notesField.element;
      const next = focused && slideX === 0
        ? keyboardShift(top, top + height, band.top, band.bottom, KEYBOARD_MARGIN) : 0;
      if (next !== shift) {
        shift = next;
        win.pivot.y = shift;
      }
    }
    const { a, tx, ty } = detail.view.worldTransform;
    notesField.place(tx + x * a, ty + y * a, width, height, a);
  };

  let renderedProfession: ProfessionKey | null = null;

  const renderContent = (inPicker: boolean) => {
    const state = store.get();
    if (mobile) {
      renderStrip(state.chosen, state.active);
    } else {
      renderTabs(state.chosen, state.active);
    }
    picker.view.visible = inPicker;
    browse.visible = !inPicker;
    professionsButton.view.visible = !inPicker;

    const profession = state.active ? professionByKey.get(state.active) : undefined;
    portrait.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (inPicker || !profession) {
      title.text = "Professions";
      barText.text = `${state.chosen.length} of 14 chosen`;
      notesField.close();
      return;
    }
    portrait.addChild(roundIcon(PROFESSION_ICONS[profession.key], PORTRAIT - 20));
    title.text = profession.name;
    const recipes = recipesByProfession.get(profession.key) ?? [];
    const knownCount = recipes.filter((recipe) => state.known.has(recipeKey(recipe))).length;
    barText.text = [
      recipes.length > 0 ? `Known ${knownCount}/${recipes.length} recipes` : "",
      profession.gatherables.length > 0 ? `${profession.gatherables.length} gatherables` : "",
    ].filter(Boolean).join("  ·  ");
    knownOnlyBox.set(state.knownOnly);

    const rows = buildRows(profession, state.collapsed, { recipes, itemOf, recipeKey },
      { known: state.known, knownOnly: state.knownOnly });
    list.setRows(rows, renderedProfession !== profession.key);
    renderedProfession = profession.key;
    const selection = state.selection;
    const selectedKey = !selection ? null : selection.kind === "recipe" ? recipeKey(selection.recipe)
      : `item:${selection.itemId}`;
    list.setSelected(selectedKey);
    detail.show(selection, selection?.kind === "recipe" && state.known.has(recipeKey(selection.recipe)),
      selectedKey ? state.notes[selectedKey] ?? "" : "");
    // Read-only until the edit mode lands: the textarea stays closed and the note shows as text.
    notesField.close();
  };

  const render = (animate: boolean) => {
    const state = store.get();
    const inPicker = state.view === "picker" || !state.active;
    renderContent(inPicker);
    if (!mobile) {
      return;
    }
    const open = !inPicker && state.detailOpen && state.selection !== null;
    slideTo(open, animate);
    back.view.visible = open;
    // Keep the title clear of the Back button on narrow frames.
    title.x = open ? Math.max(w / 2, BACK_X + BACK_WIDTH + 8 + title.width / 2) : w / 2;
  };

  // Notes are shown as text in the detail pane now, so a saved note re-renders like any other change.
  const unsubscribe = store.subscribe(() => render(true));
  if (store.get().view === "picker") {
    picker.open(carry?.picked ?? store.get().chosen);
  }
  render(false);
  if (carry && carry.profession === renderedProfession) {
    list.setPosition(carry.listPosition);
  }

  return {
    view: win,
    carry: () => ({
      profession: renderedProfession,
      listPosition: list.getPosition(),
      picked: store.get().view === "picker" ? picker.current() : null,
    }),
    destroy: () => {
      unsubscribe();
      ticker.remove(slideStep);
      viewport?.removeEventListener("resize", readBand);
      viewport?.removeEventListener("scroll", readBand);
      notesField.element.removeEventListener("focusout", resetScroll);
      win.destroy({ children: true });
    },
  };
};
