import { Container, Graphics, Rectangle, type Ticker } from "pixi.js";
import { cancelEdit, saveEdit, setKnownDraft, startEdit } from "../../app/notesEdit";
import type { AppState, Store } from "../../app/store";
import type { Profession, ProfessionKey, Recipe } from "../../data";
import {
  PROFESSION_ICONS, PROFESSION_KEYS, itemOf, professionByKey, recipeKey, recipesByProfession,
} from "../../data/model";
import {
  type ArtKit, FRAME_TITLE_HEIGHT, PALETTE, SHADOW_SPREAD, TAB_GLOW, TEXT_STYLES, createNineSlice,
  createStoneOverlay,
} from "../art";
import { keyboardShift, stripLayout } from "../layout";
import { SLIDE_MS, tweenAt } from "../motion";
import { at, button, checkbox, iconSprite, itemSlot, label, piece, roundIcon } from "../widgets";
import { NOTE_EDIT_MIN_HEIGHT, createDetailPane, noteEditMaxHeight, selectionKey } from "./detail";
import { NOTES_TEXT_SIZE, NOTES_TEXT_SIZE_MOBILE, type NotesField } from "./notesField";
import { DESKTOP_ROWS, type RowMetrics, TOUCH_ROWS, buildRows } from "./rows";
import { createScrollList } from "./scrollList";
import { SEARCH_TEXT_SIZE, type SearchField } from "./searchField";

export const WINDOW_WIDTH = 720;
export const WINDOW_HEIGHT = 580;
/** Width the side tabs add to the right of the window. */
export const TABS_WIDTH = 48 + TAB_GLOW * 2 - 10;

const TAB_SIZE = 48;
const TAB_STEP = 54;
const TABS_TOP = 52;
/** Space between the primary tabs (Alchemy, Herbalism) and the secondary ones. */
const TIER_GAP = 12;
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
/** From this frame width, the summary bar fits between Known only and Search instead of taking its own row. */
const WIDE_FRAME = 560;
/** Smallest tab cell in the mobile strip, still a comfortable touch target. */
const MIN_TAB_CELL = 44;
const SHORT_FRAME = 420;
/** Room kept between the notes field and the top of the on-screen keyboard. */
const KEYBOARD_MARGIN = 8;
/** The detail pane's frame width: the notes field is clipped inside it. */
const PANE_INSET = 2;

/** What the list is filtered by: the trimmed text of the open search field, "" when closed or blank. */
const searchQuery = (state: AppState): string => (state.search ?? "").trim();

/** Desktop: the fixed-size window, scaled by main.ts. Mobile: a frame of the given size, at scale 1. */
export type PopupLayout = { mode: "desktop" } | { mode: "mobile"; width: number; height: number };

export interface PopupEnv {
  ticker: Ticker;
  /** The DOM notes field. It outlives popups, so a rebuild keeps its text, caret and focus. */
  notesField: NotesField;
  /** The DOM search field. Like the notes field, it outlives popups so a rebuild keeps its text and focus. */
  searchField: SearchField;
  layout: PopupLayout;
}

/** View state that is not in the store, handed from a popup to the one rebuilt in its place. */
export interface PopupCarry {
  profession: ProfessionKey | null;
  /** List position in rows, so it survives a change of row height. */
  listPosition: number;
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
  /** While search is open: the field, in the list's first row slot. */
  search: Box;
  list: Box;
  detail: Box;
  professions: Box;
  /** The mobile tab strip; desktop has side tabs instead. */
  strip: (Box & { perRow: number; cell: number }) | null;
  rows: RowMetrics;
}

/**
 * Where the open search field sits: the list's first row slot, inside its pane and clear of its scrollbar. The rows
 * move down by `searchInset` to make room.
 */
const searchSlot = (list: Box, height: number): Box => ({ x: list.x + 6, y: list.y + 6, w: list.w - 30, h: height });
const searchInset = (field: Box): number => field.h + 6;

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
    search: searchSlot({ x: 16, y: CONTENT_TOP + 32, w: LIST_WIDTH, h: contentHeight - 32 }, 22),
    list: { x: 16, y: CONTENT_TOP + 32, w: LIST_WIDTH, h: contentHeight - 32 },
    detail: { x: LIST_WIDTH + 24, y: CONTENT_TOP, w: w - LIST_WIDTH - 40, h: contentHeight },
    professions: { x: w - 16 - 120, y: h - 34, w: 120, h: 24 },
    strip: null,
    rows: DESKTOP_ROWS,
  };
};

/**
 * The mobile frame, top to bottom: title strip (portrait, Back, title), the tab strip, the summary bar, a row with
 * Known only and Search (the bar joins that row on wide frames), and the list down to the bottom. Open search sits
 * in the list's first row slot. The detail pane covers everything under the title strip.
 */
const mobileGeometry = (w: number, h: number): Geometry => {
  const inner = w - MOBILE_PAD * 2;
  // Short (landscape) frames get slightly smaller tabs: their height goes to the list. On one row, the tier gap
  // takes its share of the width.
  const tabs = stripLayout(PROFESSION_KEYS.length, inner - TIER_GAP, h < SHORT_FRAME ? MIN_TAB_CELL : TAB_STEP,
    MIN_TAB_CELL);
  const strip = { x: MOBILE_PAD, y: MOBILE_CONTENT_TOP + 2, w: inner, h: tabs.rows * tabs.cell, perRow: tabs.perRow,
    cell: tabs.cell };
  const wide = w >= WIDE_FRAME;
  const barRow = strip.y + strip.h + 6;
  const controlsY = wide ? barRow : barRow + 18 + 6;
  const bar = wide ? { x: MOBILE_PAD + 130, y: controlsY + 5, w: inner - 260, h: 18 }
    : { x: MOBILE_PAD, y: barRow, w: inner, h: 18 };
  const listY = controlsY + MOBILE_BUTTON_HEIGHT + 6;
  const buttonX = w - MOBILE_PAD - 120;
  const knownOnly = { x: MOBILE_PAD + 4, y: controlsY + 4 };
  const cover = { x: MOBILE_PAD, y: MOBILE_CONTENT_TOP, w: inner, h: h - MOBILE_PAD - MOBILE_CONTENT_TOP };
  return {
    w,
    h,
    portrait: { x: -6, y: -6, scale: MOBILE_PORTRAIT_SCALE },
    bar,
    knownOnly,
    search: searchSlot({ x: MOBILE_PAD, y: listY, w: inner, h: h - MOBILE_PAD - listY }, MOBILE_BUTTON_HEIGHT),
    list: { x: MOBILE_PAD, y: listY, w: inner, h: h - MOBILE_PAD - listY },
    detail: cover,
    professions: { x: buttonX, y: controlsY, w: 120, h: MOBILE_BUTTON_HEIGHT },
    strip,
    rows: TOUCH_ROWS,
  };
};

/**
 * The profession window: frame, portrait, title, a summary bar, the five profession tabs (the two primary ones set
 * apart), and the list and detail panes. It renders from the store and writes user actions back to it.
 *
 * Desktop is the fixed window with side tabs and the list and detail side by side. Mobile fills the screen: the
 * tabs become a strip under the title, the list takes the full width, and selecting an entry slides the detail
 * pane in over it from the right, with a Back button in the title strip.
 */
export const createPopup = (kit: ArtKit, store: Store, env: PopupEnv, carry?: PopupCarry): Popup => {
  const { ticker, notesField, searchField, layout } = env;
  const mobile = layout.mode === "mobile";
  const g = layout.mode === "mobile" ? mobileGeometry(layout.width, layout.height) : desktopGeometry();
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
      // Matches show in collapsed sections too while searching, so a toggle would change what nobody can see.
      if (searchQuery(store.get()) !== "") {
        return;
      }
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
    onToggleKnown: (_recipe, isKnown) => setKnownDraft(store, isKnown),
    onEditNote: () => {
      const { selection } = store.get();
      const key = selectionKey(selection);
      if (key) {
        // Back and the back gesture clear `detailOpen` but keep the selection, which desktop still shows;
        // an edit needs the pane counted as open, or the leave guard cancels it at once.
        if (!store.get().detailOpen) {
          store.set({ detailOpen: true });
        }
        startEdit(store, key, selection?.kind === "recipe");
        // Inside the press, so phones raise the keyboard.
        notesField.focus();
      }
    },
    onSaveNote: () => saveEdit(store),
    onCancelNote: () => cancelEdit(store),
  });
  const knownOnlyBox = checkbox(kit, "Known only", TEXT_STYLES.row,
    (knownOnly) => store.set({ knownOnly }), store.get().knownOnly);
  // Search is a toggle: open, it reads "Close" and keeps the pressed look.
  const searchButton = button(kit, "Search", g.professions.w, () => {
    if (store.get().search === null) {
      store.set({ search: "" });
      // Inside the press, so phones raise the keyboard.
      searchField.focus();
    } else {
      store.set({ search: null });
    }
  }, g.professions.h);
  // In the first row under the search field's slot (search is always open when nothing matches).
  const noMatches = label("No matches.", TEXT_STYLES.muted, g.list.x + (g.list.w - 17) / 2,
    g.search.y + searchInset(g.search) + g.rows.row / 2, 0.5);
  noMatches.visible = false;

  const browse = new Container();
  // Mobile: everything the detail pane covers, hidden while it is fully open.
  const under = new Container();
  const slider = new Container();
  if (mobile) {
    under.addChild(tabs, barTrack, barText);
    under.addChild(at(list.view, g.list.x, g.list.y), noMatches);
    under.addChild(at(knownOnlyBox.view, g.knownOnly.x, g.knownOnly.y));
    under.addChild(at(searchButton.view, g.professions.x, g.professions.y));
    // A finger-sized target around the small box.
    knownOnlyBox.view.hitArea = new Rectangle(-8, -5, knownOnlyBox.view.width + 16, 30);
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
    browse.addChild(at(list.view, g.list.x, g.list.y), noMatches);
    browse.addChild(at(detail.view, g.detail.x, g.detail.y));
    // The list's top strip, where the game has search and filter, holds the known-only filter and the search field.
    browse.addChild(at(knownOnlyBox.view, g.knownOnly.x, g.knownOnly.y));
  }
  win.addChild(browse);

  if (!mobile) {
    win.addChild(at(searchButton.view, g.professions.x, g.professions.y));
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

  const tabPressed = (key: ProfessionKey) => store.set({ active: key, selection: null, detailOpen: false });

  /** One profession tab: gold when active, bronze-rimmed when primary, grey otherwise. */
  const tab = (key: ProfessionKey, active: ProfessionKey, iconX: number): Container => {
    const primary = professionByKey.get(key)?.tier === "primary";
    const view = new Container();
    view.addChild(at(createNineSlice(kit.pieces[key === active ? "tabActive" : primary ? "tabPrimary" : "tab"],
      TAB_SIZE + TAB_GLOW * 2, TAB_SIZE + TAB_GLOW * 2), -TAB_GLOW, -TAB_GLOW));
    view.addChild(at(itemSlot(kit, PROFESSION_ICONS[key], 36), iconX, 6));
    view.eventMode = "static";
    view.cursor = "pointer";
    view.on("pointertap", () => tabPressed(key));
    return view;
  };
  /** How many of the tabs, in order, are primary: the gap goes after them. */
  const primaryCount = PROFESSION_KEYS.filter((key) => professionByKey.get(key)?.tier === "primary").length;

  /** Desktop: the tabs down the window's right side, with a gap after the primary ones. */
  const renderTabs = (active: ProfessionKey) => {
    tabs.removeChildren().forEach((child) => child.destroy({ children: true }));
    const count = PROFESSION_KEYS.length;
    const step = Math.min(TAB_STEP, Math.floor((h - TABS_TOP - 20 - TIER_GAP) / count));
    const scale = Math.min(1, step / TAB_STEP);
    PROFESSION_KEYS.forEach((key, i) => {
      const view = tab(key, active, 10);
      view.scale.set(scale);
      const isActive = key === active;
      tabs.addChild(at(view, w - 10 + (isActive ? 2 : 0), TABS_TOP + i * step + (i >= primaryCount ? TIER_GAP : 0)));
    });
  };

  /**
   * Mobile: square tabs under the title. On one row, a gap follows the primary tabs; on two, the primary tabs take
   * the first row and the secondary ones the second.
   */
  const renderStrip = (active: ProfessionKey) => {
    tabs.removeChildren().forEach((child) => child.destroy({ children: true }));
    const strip = g.strip;
    if (!strip) {
      return;
    }
    const scale = strip.cell / TAB_STEP;
    const inset = (TAB_STEP - TAB_SIZE) / 2;
    const oneRow = strip.perRow >= PROFESSION_KEYS.length;
    PROFESSION_KEYS.forEach((key, i) => {
      const secondary = i >= primaryCount;
      const column = oneRow || !secondary ? i : i - primaryCount;
      const row = oneRow || !secondary ? 0 : 1;
      const view = tab(key, active, 6);
      view.scale.set(scale);
      // The whole cell, gap included, takes the tap.
      view.hitArea = new Rectangle(-inset, -inset, TAB_STEP, TAB_STEP);
      tabs.addChild(at(view, strip.x + (column * TAB_STEP + inset) * scale + (oneRow && secondary ? TIER_GAP : 0),
        strip.y + (row * TAB_STEP + inset) * scale));
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
    searchField.element.addEventListener("focusout", resetScroll);
  }
  let shift = 0;

  // While a note is edited, it lives in a DOM textarea over the note block of the detail pane. It is moved to the
  // block's screen rectangle every frame (cheap when nothing moved), so it follows the popup's scale, the pane's
  // scrolling and the window size.
  notesField.setTextSize(mobile ? NOTES_TEXT_SIZE_MOBILE : NOTES_TEXT_SIZE);
  notesField.setVisible(true);
  searchField.setTextSize(mobile ? NOTES_TEXT_SIZE_MOBILE : SEARCH_TEXT_SIZE);
  let editHeight = NOTE_EDIT_MIN_HEIGHT;
  const maxEditHeight = noteEditMaxHeight(g.detail.h);
  detail.view.onRender = () => {
    const box = store.get().editing ? detail.noteBox() : null;
    if (!box) {
      if (shift !== 0) {
        shift = 0;
        win.pivot.y = 0;
      }
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
    // The pane's content is masked but the DOM field is not: clip it to the pane when it scrolls past an edge.
    const clip = { top: Math.max(0, PANE_INSET - y), bottom: Math.max(0, y + height - (g.detail.h - PANE_INSET)) };
    notesField.place(tx + x * a, ty + y * a, width, height, a, clip);
  };

  // The search input sits over the list's top strip, moved there every frame from the window's transform like the
  // notes field (cheap when nothing moved). It hides while the mobile detail pane covers the list.
  win.onRender = () => {
    searchField.setVisible(slideX === away);
    const { a, tx, ty } = win.worldTransform;
    searchField.place(tx + g.search.x * a, ty + g.search.y * a, g.search.w, g.search.h, a);
  };

  let renderedProfession: ProfessionKey | null = null;
  let renderedQuery = "";

  /** Rebuilds the detail pane from the store: the entry, its saved note, and the textarea's room while editing. */
  const showDetail = () => {
    const { selection, known, notes, editing } = store.get();
    const key = selectionKey(selection);
    const editingThis = editing !== null && editing.key === key;
    // While editing, the checkbox shows the draft's known flag; otherwise the saved one.
    const isKnown = editingThis && editing.known !== undefined ? editing.known
      : selection?.kind === "recipe" && known.has(recipeKey(selection.recipe));
    detail.show(selection, isKnown, key ? notes[key] ?? "" : "", editingThis ? editHeight : null);
  };

  /** Sizes the textarea to its text, within the minimum and maximum. True when its height changed. */
  const fitEditor = (): boolean => {
    const box = detail.noteBox();
    const needed = box ? notesField.measure(box.width) : 0;
    if (needed === 0) {
      return false;
    }
    const next = Math.min(maxEditHeight, Math.max(NOTE_EDIT_MIN_HEIGHT, needed));
    const changed = next !== editHeight;
    editHeight = next;
    return changed;
  };

  /** Rebuilds the list rows from the store; a new profession or query goes back to the top. */
  const renderList = (profession: Profession, recipes: Recipe[], state: AppState): string | null => {
    const query = searchQuery(state);
    const rows = buildRows(profession, state.collapsed, { recipes, itemOf, recipeKey },
      { known: state.known, knownOnly: state.knownOnly, query });
    list.setRows(rows, renderedProfession !== profession.key || renderedQuery !== query);
    renderedProfession = profession.key;
    renderedQuery = query;
    noMatches.visible = rows.length === 0 && query !== "";
    const selection = state.selection;
    const selectedKey = !selection ? null : selection.kind === "recipe" ? recipeKey(selection.recipe)
      : `item:${selection.itemId}`;
    list.setSelected(selectedKey);
    return selectedKey;
  };

  const renderContent = () => {
    const state = store.get();
    if (mobile) {
      renderStrip(state.active);
    } else {
      renderTabs(state.active);
    }
    const searching = state.search !== null;
    searchButton.setLatched(searching);
    searchButton.setCaption(searching ? "Close" : "Search");

    const profession = professionByKey.get(state.active);
    portrait.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!profession) {
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
    list.setTopInset(searching ? searchInset(g.search) : 0);
    if (searching) {
      searchField.open(state.search ?? "");
    } else {
      searchField.close();
    }
    const selectedKey = renderList(profession, recipes, state);
    const editing = state.editing && state.editing.key === selectedKey ? state.editing : null;
    if (!editing) {
      editHeight = NOTE_EDIT_MIN_HEIGHT;
      notesField.close();
    }
    showDetail();
    if (editing) {
      notesField.open(editing.key, editing.draft);
      // The textarea can only be measured once it is shown; a different height rebuilds the pane once more.
      if (fitEditor()) {
        showDetail();
      }
    }
  };

  const render = (animate: boolean) => {
    const state = store.get();
    renderContent();
    if (!mobile) {
      return;
    }
    const open = state.detailOpen && state.selection !== null;
    slideTo(open, animate);
    back.view.visible = open;
    // Keep the title clear of the Back button on narrow frames.
    title.x = open ? Math.max(w / 2, BACK_X + BACK_WIDTH + 8 + title.width / 2) : w / 2;
  };

  // Typing only changes the draft: grow the textarea if its text needs it, without rebuilding anything else.
  const onlyDraftChanged = (state: AppState, previous: AppState): boolean =>
    state.editing !== null && previous.editing !== null && state.editing.key === previous.editing.key
    && (Object.keys(state) as (keyof AppState)[]).every((field) =>
      field === "editing" || state[field] === previous[field]);
  // Typing in the search field only changes its text: refilter the list, and leave the detail pane alone.
  const onlySearchTextChanged = (state: AppState, previous: AppState): boolean =>
    state.search !== null && previous.search !== null
    && (Object.keys(state) as (keyof AppState)[]).every((field) =>
      field === "search" || state[field] === previous[field]);
  const unsubscribe = store.subscribe((state, previous) => {
    const profession = professionByKey.get(state.active);
    if (onlySearchTextChanged(state, previous) && profession) {
      renderList(profession, recipesByProfession.get(profession.key) ?? [], state);
    } else if (!onlyDraftChanged(state, previous)) {
      render(true);
    } else if (fitEditor()) {
      showDetail();
    }
  });
  render(false);
  if (carry && carry.profession === renderedProfession) {
    list.setPosition(carry.listPosition);
  }

  return {
    view: win,
    carry: () => ({
      profession: renderedProfession,
      listPosition: list.getPosition(),
    }),
    destroy: () => {
      unsubscribe();
      ticker.remove(slideStep);
      viewport?.removeEventListener("resize", readBand);
      viewport?.removeEventListener("scroll", readBand);
      notesField.element.removeEventListener("focusout", resetScroll);
      searchField.element.removeEventListener("focusout", resetScroll);
      win.destroy({ children: true });
    },
  };
};
