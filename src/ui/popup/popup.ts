import { Container, Graphics, Rectangle, type Ticker } from "pixi.js";
import { cancelEdit, saveEdit, setKnownDraft, startEdit } from "../../app/notesEdit";
import type { AppState, Store } from "../../app/store";
import { toggled } from "../../collections";
import type { Profession, ProfessionKey, Recipe } from "../../data";
import {
  PROFESSION_ICONS, itemOf, locationsOf, professionByKey, recipeKey, recipesByProfession,
} from "../../data/model";
import { type ArtKit, FRAME_TITLE_HEIGHT, PALETTE, SHADOW_SPREAD, TEXT_STYLES, createStoneOverlay } from "../art";
import { FIELD_TEXT_SIZE, FIELD_TEXT_SIZE_MOBILE } from "../dom";
import { keyboardShift } from "../layout";
import { SLIDE_MS, tweenAt } from "../motion";
import { at, button, checkbox, clearChildren, iconSprite, label, piece, roundIcon } from "../widgets";
import { NOTE_EDIT_MIN_HEIGHT, createDetailPane, noteEditMaxHeight, selectionKey } from "./detail";
import { desktopGeometry, mobileGeometry, searchInset } from "./geometry";
import type { NotesField } from "./notesField";
import { buildRows } from "./rows";
import { createScrollList } from "./scrollList";
import type { SearchField } from "./searchField";
import { createTabs } from "./tabs";

const PORTRAIT = 72;
const BACK_X = 48;
const BACK_WIDTH = 72;
const BACK_HEIGHT = 22;
/** Room kept between the notes field and the top of the on-screen keyboard. */
const KEYBOARD_MARGIN = 8;
/** The detail pane's frame width: the notes field is clipped inside it. */
const PANE_INSET = 2;

/** What the list is filtered by: the trimmed text of the open search field, "" when closed or blank. */
const searchQuery = (state: AppState): string => (state.search ?? "").trim();

/** Whether `field` is the only one that differs between the two states. */
const onlyChanged = (state: AppState, previous: AppState, field: keyof AppState): boolean =>
  (Object.keys(state) as (keyof AppState)[]).every((key) => key === field || state[key] === previous[key]);

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

/**
 * The mobile detail pane's slide: its x offset, 0 when open and `away` when out of sight. `apply` shows each offset.
 * A ticker listener runs only while it moves.
 */
const createSlide = (ticker: Ticker, away: number, apply: (x: number) => void) => {
  let x = away;
  let tween: { from: number; to: number; elapsed: number } | null = null;
  const step = (t: Ticker) => {
    if (!tween) {
      return;
    }
    tween.elapsed += t.deltaMS;
    x = tweenAt(tween.from, tween.to, tween.elapsed, SLIDE_MS);
    if (tween.elapsed >= SLIDE_MS) {
      x = tween.to;
      stop();
    }
    apply(x);
  };
  const stop = () => {
    tween = null;
    ticker.remove(step);
  };
  return {
    x: () => x,
    to: (open: boolean, animate: boolean) => {
      const to = open ? 0 : away;
      if (!animate) {
        stop();
        x = to;
        apply(x);
        return;
      }
      if ((tween ? tween.to : x) === to) {
        return;
      }
      if (!tween) {
        ticker.add(step);
      }
      // A reversal mid-way starts from where the pane is, so it never jumps.
      tween = { from: x, to, elapsed: 0 };
    },
    stop,
  };
};

/**
 * The band of the layout viewport the on-screen keyboard leaves visible, from `visualViewport`. Also puts back the
 * page scroll iOS may add to show a focused field, once the field lets go.
 */
const watchKeyboardBand = (fields: HTMLElement[]) => {
  const viewport = window.visualViewport;
  let band = { top: 0, bottom: window.innerHeight };
  const read = () => {
    band = viewport ? { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height }
      : { top: 0, bottom: window.innerHeight };
  };
  const resetScroll = () => window.scrollTo(0, 0);
  read();
  viewport?.addEventListener("resize", read);
  viewport?.addEventListener("scroll", read);
  fields.forEach((field) => field.addEventListener("focusout", resetScroll));
  return {
    band: () => band,
    destroy: () => {
      viewport?.removeEventListener("resize", read);
      viewport?.removeEventListener("scroll", read);
      fields.forEach((field) => field.removeEventListener("focusout", resetScroll));
    },
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
  const tabs = createTabs(kit, g, g.strip, (key) => store.set({ active: key, selection: null, detailOpen: false }));
  if (!mobile) {
    // Under the frame, which they tuck beneath.
    win.addChild(tabs.view);
  }
  win.addChild(piece(kit, "frame", w, h));
  win.addChild(at(createStoneOverlay(kit, w - 10, h - FRAME_TITLE_HEIGHT - 5, 0.8), 5, FRAME_TITLE_HEIGHT));
  const title = label("", TEXT_STYLES.title, w / 2, FRAME_TITLE_HEIGHT / 2 + 1, 0.5);
  win.addChild(title);

  // Portrait medallion: the active profession's icon in the corner ring.
  const medallion = at(new Container(), g.portrait.x, g.portrait.y);
  medallion.scale.set(g.portrait.scale);
  const portrait = at(new Container(), 10, 10);
  medallion.addChild(piece(kit, "portraitBack"), portrait, piece(kit, "portraitRing"));
  win.addChild(medallion);

  // Summary bar: known-recipe progress and the gatherable count.
  const barTrack = at(piece(kit, "barTrack", g.bar.w, g.bar.h), g.bar.x, g.bar.y);
  const barText = label("", TEXT_STYLES.bar, g.bar.x + g.bar.w / 2, g.bar.y + 9, 0.5);

  const select = (selection: AppState["selection"]) => store.set({ selection, detailOpen: true });
  const list = createScrollList(kit, g.list.w, g.list.h, {
    onSelect: (row) => {
      if (row.kind === "recipe") {
        select({ kind: "recipe", recipe: row.recipe });
      } else if (row.kind === "item") {
        select({ kind: "item", itemId: row.itemId });
      }
    },
    onToggle: (id) => {
      // Matches show in collapsed sections too while searching, so a toggle would change what nobody can see.
      const { collapsed } = store.get();
      if (searchQuery(store.get()) === "") {
        store.set({ collapsed: toggled(collapsed, id, !collapsed.has(id)) });
      }
    },
  }, ticker, g.rows);
  const detail = createDetailPane(kit, g.detail.w, g.detail.h, ticker, {
    onSelectItem: (itemId) => select({ kind: "item", itemId }),
    onToggleKnown: (_recipe, isKnown) => setKnownDraft(store, isKnown),
    onEditNote: () => {
      const { selection, detailOpen } = store.get();
      const key = selectionKey(selection);
      if (key) {
        // Back and the back gesture clear `detailOpen` but keep the selection, which desktop still shows;
        // an edit needs the pane counted as open, or the leave guard cancels it at once.
        if (!detailOpen) {
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
  const knownOnlyBox = checkbox(kit, "Known only", TEXT_STYLES.row, (checked) => {
    const { active, knownOnly } = store.get();
    store.set({ knownOnly: toggled(knownOnly, active, checked) });
  }, store.get().knownOnly.has(store.get().active));
  // Search is a toggle: open, it reads "Close" and keeps the pressed look.
  const searchButton = button(kit, "Search", g.searchButton.w, () => {
    if (store.get().search === null) {
      store.set({ search: "" });
      // Inside the press, so phones raise the keyboard.
      searchField.focus();
    } else {
      store.set({ search: null });
    }
  }, g.searchButton.h);
  // In the first row under the search field's slot (search is always open when nothing matches).
  const noMatches = label("No matches.", TEXT_STYLES.muted, g.list.x + (g.list.w - 17) / 2,
    g.search.y + searchInset(g.search) + g.rows.row / 2, 0.5);
  noMatches.visible = false;

  // Mobile: everything the detail pane covers, hidden while it is fully open. Desktop shows it all at once.
  const under = new Container();
  const slider = new Container();
  under.addChild(at(list.view, g.list.x, g.list.y), noMatches, at(knownOnlyBox.view, g.knownOnly.x, g.knownOnly.y),
    at(searchButton.view, g.searchButton.x, g.searchButton.y));
  if (mobile) {
    under.addChild(tabs.view, barTrack, barText);
    // A finger-sized target around the small box.
    knownOnlyBox.view.hitArea = new Rectangle(-8, -5, knownOnlyBox.view.width + 16, 30);
    // The pane slides in from under the frame's right edge; the mask hides it outside the frame.
    slider.addChild(at(detail.view, g.detail.x, g.detail.y));
    const sliderMask = new Graphics().rect(5, FRAME_TITLE_HEIGHT, w - 10, h - FRAME_TITLE_HEIGHT - 5).fill(0xffffff);
    slider.mask = sliderMask;
    win.addChild(under, slider, sliderMask);
    // Taps on the pane must not reach the list under it.
    detail.view.eventMode = "static";
    detail.view.hitArea = new Rectangle(0, 0, g.detail.w, g.detail.h);
  } else {
    win.addChild(barTrack, barText, under, at(detail.view, g.detail.x, g.detail.y));
  }

  const back = button(kit, "Back", BACK_WIDTH, () => store.set({ detailOpen: false }), BACK_HEIGHT);
  // Always in the tree, hidden on desktop: a button left outside it is never destroyed with the popup, and its
  // caption's listener on the shared text style would keep every rebuilt desktop popup alive.
  win.addChild(at(back.view, BACK_X, (FRAME_TITLE_HEIGHT - BACK_HEIGHT) / 2));
  back.view.visible = false;
  if (mobile) {
    const chevron = iconSprite(kit.icons.chevronRight, 13, 11, PALETTE.text.header);
    chevron.scale.x = -1;
    back.view.addChild(chevron);
  }

  const away = w;
  const slide = createSlide(ticker, away, (x) => {
    slider.x = Math.round(x);
    slider.visible = x < away;
    under.visible = x > 0;
    // The textarea can't follow the pane smoothly; it shows once the pane has settled.
    notesField.setVisible(x === 0);
  });

  // Mobile on-screen keyboard: while the notes field has focus and the keyboard covers it, the whole frame moves up
  // (through its pivot) just enough.
  const keyboard = mobile ? watchKeyboardBand([notesField.element, searchField.element]) : null;
  const shiftFrame = (shift: number) => {
    if (win.pivot.y !== shift) {
      win.pivot.y = shift;
    }
  };

  const textSize = mobile ? FIELD_TEXT_SIZE_MOBILE : FIELD_TEXT_SIZE;
  notesField.setTextSize(textSize);
  notesField.setVisible(true);
  searchField.setTextSize(textSize);
  let editHeight = NOTE_EDIT_MIN_HEIGHT;
  const maxEditHeight = noteEditMaxHeight(g.detail.h);

  // While a note is edited, it lives in a DOM textarea over the note block of the detail pane. It is moved to the
  // block's screen rectangle every frame (cheap when nothing moved), so it follows the popup's scale, the pane's
  // scrolling and the window size.
  detail.view.onRender = () => {
    const box = store.get().editing ? detail.noteBox() : null;
    if (!box) {
      shiftFrame(0);
      return;
    }
    const { x, y, width, height } = box;
    if (keyboard) {
      // Mobile runs at scale 1, so the field's unshifted top is plain arithmetic.
      const top = win.y + g.detail.y + y;
      const { top: visibleTop, bottom: visibleBottom } = keyboard.band();
      shiftFrame(document.activeElement === notesField.element && slide.x() === 0
        ? keyboardShift(top, top + height, visibleTop, visibleBottom, KEYBOARD_MARGIN) : 0);
    }
    const { a, tx, ty } = detail.view.worldTransform;
    // The pane's content is masked but the DOM field is not: clip it to the pane when it scrolls past an edge.
    const clip = { top: Math.max(0, PANE_INSET - y), bottom: Math.max(0, y + height - (g.detail.h - PANE_INSET)) };
    notesField.place(tx + x * a, ty + y * a, width, height, a, clip);
  };

  // The search input sits in the list's first row slot, moved there every frame like the notes field. It hides
  // while the mobile detail pane covers the list.
  win.onRender = () => {
    searchField.setVisible(slide.x() === away);
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
  const renderList = (profession: Profession, recipes: Recipe[], state: AppState) => {
    const query = searchQuery(state);
    const rows = buildRows(profession, state.collapsed, { recipes, itemOf, recipeKey, zonesOf: locationsOf },
      { known: state.known, knownOnly: state.knownOnly.has(profession.key), query });
    list.setRows(rows, renderedProfession !== profession.key || renderedQuery !== query);
    renderedProfession = profession.key;
    renderedQuery = query;
    noMatches.visible = rows.length === 0 && query !== "";
    list.setSelected(selectionKey(state.selection));
  };

  /** The portrait, title, summary bar and Known only box of `profession`. */
  const renderHeader = (profession: Profession, recipes: Recipe[], state: AppState) => {
    portrait.addChild(roundIcon(PROFESSION_ICONS[profession.key], PORTRAIT - 20));
    title.text = profession.name;
    const knownCount = recipes.filter((recipe) => state.known.has(recipeKey(recipe))).length;
    barText.text = [
      recipes.length > 0 ? `Known ${knownCount}/${recipes.length} recipes` : "",
      profession.gatherables.length > 0 ? `${profession.gatherables.length} gatherables` : "",
    ].filter(Boolean).join("  ·  ");
    knownOnlyBox.set(state.knownOnly.has(profession.key));
  };

  /** Opens or closes the search field to match the store, making room for it above the list rows. */
  const renderSearch = (state: AppState) => {
    const searching = state.search !== null;
    searchButton.setLatched(searching);
    searchButton.setCaption(searching ? "Close" : "Search");
    list.setTopInset(searching ? searchInset(g.search) : 0);
    if (searching) {
      searchField.open(state.search ?? "");
    } else {
      searchField.close();
    }
  };

  /** Rebuilds the detail pane, with the notes field open over it while the shown entry is edited. */
  const renderDetail = (state: AppState) => {
    const editing = state.editing && state.editing.key === selectionKey(state.selection) ? state.editing : null;
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
    tabs.render(state.active);
    clearChildren(portrait);
    const profession = professionByKey.get(state.active);
    if (profession) {
      const recipes = recipesByProfession.get(profession.key) ?? [];
      renderHeader(profession, recipes, state);
      renderSearch(state);
      renderList(profession, recipes, state);
      renderDetail(state);
    }
    if (mobile) {
      const open = state.detailOpen && state.selection !== null;
      slide.to(open, animate);
      back.view.visible = open;
      // Keep the title clear of the Back button on narrow frames.
      title.x = open ? Math.max(w / 2, BACK_X + BACK_WIDTH + 8 + title.width / 2) : w / 2;
    }
  };

  // Typing in the search field only changes its text: refilter the list, and leave the detail pane alone.
  const searchTyped = (state: AppState, previous: AppState): boolean =>
    state.search !== null && previous.search !== null && onlyChanged(state, previous, "search");
  // Typing a note only changes the draft: grow the textarea if its text needs it, without rebuilding anything else.
  const draftTyped = (state: AppState, previous: AppState): boolean =>
    state.editing !== null && previous.editing !== null && state.editing.key === previous.editing.key
    && onlyChanged(state, previous, "editing");

  const unsubscribe = store.subscribe((state, previous) => {
    const profession = professionByKey.get(state.active);
    if (profession && searchTyped(state, previous)) {
      renderList(profession, recipesByProfession.get(profession.key) ?? [], state);
    } else if (!draftTyped(state, previous)) {
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
      slide.stop();
      keyboard?.destroy();
      win.destroy({ children: true });
    },
  };
};
