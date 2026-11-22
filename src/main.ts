import "./style.css";
import { Application } from "pixi.js";
import { syncBackHistory } from "./app/backHistory";
import { cancelEdit, cancelEditOnLeave, saveEdit, setDraft } from "./app/notesEdit";
import { fromSaved, loadSaved, persist } from "./app/storage";
import { createStore } from "./app/store";
import { professions } from "./data";
import { PALETTE, createArtKit, createBackdrop, loadFonts } from "./ui/art";
import { type LayoutMode, desktopScale, layoutMode } from "./ui/layout";
import { selectionKey } from "./ui/popup/detail";
import { createNotesField } from "./ui/popup/notesField";
import {
  MOBILE_BUTTON_HEIGHT, type Popup, TABS_WIDTH, WINDOW_HEIGHT, WINDOW_WIDTH, createPopup,
} from "./ui/popup/popup";

const MAX_RESOLUTION = 2;
// Room for the portrait medallion that pokes out of the top-left corner.
const CORNER = 16;
/** Space around the phone frame, about the height of its buttons, so it reads as a window rather than the page. */
const MOBILE_MARGIN = MOBILE_BUTTON_HEIGHT;
const FOOTPRINT = { width: WINDOW_WIDTH + TABS_WIDTH + CORNER, height: WINDOW_HEIGHT + CORNER };

const app = new Application();

// Fonts first: Pixi caches text metrics, so no `Text` may exist before the display face is ready.
await Promise.all([
  loadFonts(),
  app.init({
    resizeTo: window,
    background: PALETTE.ink,
    resolution: Math.min(window.devicePixelRatio, MAX_RESOLUTION),
    autoDensity: true,
    antialias: true,
  }),
]);

document.body.appendChild(app.canvas);

const kit = createArtKit(app.renderer);
const backdrop = createBackdrop(app.renderer);
const store = createStore(fromSaved(loadSaved(new Set(professions.map((profession) => profession.key)))));
persist(store);
app.stage.addChild(backdrop.view);

const notesField = createNotesField({
  onInput: (key, text) => setDraft(store, key, text),
  onSave: () => saveEdit(store),
  onCancel: () => cancelEdit(store),
});
// Leaving the entry being edited cancels the edit. Before any popup subscribes, so views never see a stale edit.
cancelEditOnLeave(store, (state) => selectionKey(state.selection));

let mode: LayoutMode | null = null;
let built = { width: 0, height: 0 };
let popup: Popup | null = null;

/**
 * Scales and positions the popup for the current mode. Every build must end here: a popup rebuilt outside a resize
 * (the mobile tab strip after a picker change) otherwise sits at (0, 0), off its margin.
 */
const place = (width: number, height: number) => {
  if (!popup) {
    return;
  }
  if (mode === "mobile") {
    popup.view.scale.set(1);
    popup.view.position.set(MOBILE_MARGIN, MOBILE_MARGIN);
    return;
  }
  const scale = desktopScale(width, height, FOOTPRINT);
  popup.view.scale.set(scale);
  popup.view.position.set(
    Math.round((width - FOOTPRINT.width * scale) / 2 + CORNER * scale),
    Math.round((height - FOOTPRINT.height * scale) / 2 + CORNER * scale),
  );
};

/** Replaces the popup with one for the current mode and size, carrying over what the store doesn't hold. */
const build = (width: number, height: number) => {
  const carry = popup?.carry();
  popup?.destroy();
  built = { width, height };
  popup = createPopup(kit, store, {
    ticker: app.ticker,
    notesField,
    layout: mode === "mobile"
      ? { mode, width: width - MOBILE_MARGIN * 2, height: height - MOBILE_MARGIN * 2 }
      : { mode: "desktop" },
  }, carry);
  app.stage.addChild(popup.view);
  place(width, height);
};

const layout = (width: number, height: number) => {
  backdrop.resize(width, height);
  const next = layoutMode(width, height, FOOTPRINT);
  // Some phones shrink the window for the on-screen keyboard instead of only the visual viewport. While a note is
  // being typed, a height-only change is the keyboard: keep the frame and let the keyboard handling lift it.
  const keyboard = next === "mobile" && mode === "mobile" && width === built.width
    && document.activeElement === notesField.element;
  if (next !== mode || (next === "mobile" && !keyboard && (width !== built.width || height !== built.height))) {
    const modeChanged = next !== mode;
    mode = next;
    build(width, height);
    if (modeChanged) {
      backHistory.layoutChanged();
    }
  }
  place(width, height);
};
// Before the first layout: a mode change during it reports to the back-gesture history.
const backHistory = syncBackHistory(store, () => mode === "mobile");
app.renderer.on("resize", layout);
layout(app.screen.width, app.screen.height);
// A resize skipped while typing is applied once the field lets go.
notesField.element.addEventListener("blur", () => layout(app.screen.width, app.screen.height));

// The mobile tab strip is sized for the chosen professions: rebuild when they change, before the next frame.
store.subscribe((state, previous) => {
  if (mode === "mobile" && state.chosen !== previous.chosen) {
    app.ticker.addOnce(() => build(app.screen.width, app.screen.height));
  }
});

// Clicking outside the window, or pressing B, cycles the background scene.
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
// A drag that starts on the list and ends outside the popup also taps the stage (their common ancestor), so only a
// press that began outside counts.
let pressedOutside = false;
const outsidePopup = (x: number, y: number) => !!popup && !popup.view.getBounds().containsPoint(x, y);
app.stage.on("pointerdown", (event) => {
  pressedOutside = outsidePopup(event.global.x, event.global.y);
});
app.stage.on("pointertap", (event) => {
  if (pressedOutside && outsidePopup(event.global.x, event.global.y)) {
    backdrop.next();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "b" && !(event.target instanceof HTMLTextAreaElement)) {
    backdrop.next();
  }
});

window.debug = { ...window.debug, store, backdrop };
