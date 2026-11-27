import "./style.css";
import { Application } from "pixi.js";
import { syncBackHistory } from "./app/backHistory";
import { cancelEdit, cancelEditOnLeave, setDraft } from "./app/notesEdit";
import { createOwner } from "./app/owner";
import { loadShared } from "./app/shared";
import { fromSaved, loadSaved, persist } from "./app/storage";
import { createStore } from "./app/store";
import { professions } from "./data";
import { PALETTE, createArtKit, createBackdrop, loadFonts, nextBackground } from "./ui/art";
import { hex, isTextField } from "./ui/dom";
import { type LayoutMode, desktopScale, layoutMode, needsUpright } from "./ui/layout";
import { selectionKey } from "./ui/popup/detail";
import { MOBILE_BUTTON_HEIGHT, TABS_WIDTH, WINDOW_HEIGHT, WINDOW_WIDTH } from "./ui/popup/geometry";
import { createNotesField } from "./ui/popup/notesField";
import { type Popup, createPopup } from "./ui/popup/popup";
import { createSearchField } from "./ui/popup/searchField";
import { createKeyDialog } from "./ui/keyDialog";
import { createUprightNotice } from "./ui/uprightNotice";

const MAX_RESOLUTION = 2;
// Room for the portrait medallion that pokes out of the top-left corner.
const CORNER = 16;
/** The installed owner app has the screen to itself, so its frame fills it. */
const installed = window.matchMedia("(display-mode: standalone)").matches;
/** In the installed app, just room for the medallion poking 6 px out of the frame's top-left corner. */
const APP_MARGIN = 8;
/**
 * Space around the phone frame, about the height of its buttons, so it reads as a window rather than the page.
 * The installed app keeps only `APP_MARGIN`.
 */
const MOBILE_MARGIN = installed ? APP_MARGIN : MOBILE_BUTTON_HEIGHT;
/** Top and bottom get twice the side margin in a browser. */
const MOBILE_MARGIN_Y = installed ? APP_MARGIN : MOBILE_MARGIN * 2;
const FOOTPRINT = { width: WINDOW_WIDTH + TABS_WIDTH + CORNER, height: WINDOW_HEIGHT + CORNER };

/** `?zu` (any value) in the address shows the owner's lock. */
const showLock = new URLSearchParams(window.location.search).has("zu");
// The installable app is the owner's editor: only the `?zu` address links its manifest, so visitors are never
// offered an install. Linked before anything is awaited, so the browser sees it early.
if (showLock) {
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = `${import.meta.env.BASE_URL}manifest.webmanifest`;
  const theme = document.createElement("meta");
  theme.name = "theme-color";
  theme.content = hex(PALETTE.ink);
  document.head.append(manifest, theme);
}

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
const store = createStore(fromSaved(loadSaved(new Set(professions.map((profession) => profession.key)))));
const backdrop = createBackdrop(app.renderer, store.get().background);
// The scene is the owner's choice, from the server: hidden until it arrives, so visitors never see the default flash
// past first.
backdrop.view.visible = false;
store.subscribe((state) => {
  backdrop.view.visible = state.shared !== "loading";
  if (state.background !== backdrop.variant) {
    backdrop.setVariant(state.background);
  }
});
const owner = createOwner(store);
// Visitors always start with Known only on everywhere; the owner's browser keeps the last saved choice.
if (!owner.remembered()) {
  store.set({ knownOnly: new Set(professions.map((profession) => profession.key)) });
}
persist(store);
void loadShared(store);
void owner.restore();
const keyDialog = createKeyDialog(owner.login);
app.stage.addChild(backdrop.view);

const notesField = createNotesField({
  onInput: (key, text) => setDraft(store, key, text),
  onSave: () => void owner.save(),
  onCancel: () => cancelEdit(store),
});
const searchField = createSearchField((text) => store.set({ search: text }));
// Leaving the entry being edited cancels the edit. Before any popup subscribes, so views never see a stale edit.
cancelEditOnLeave(store, (state) => selectionKey(state.selection));

let mode: LayoutMode | null = null;
let built = { width: 0, height: 0 };
let popup: Popup | null = null;

/**
 * Scales and positions the popup for the current mode. Every build must end here, or the popup sits at (0, 0),
 * off its margin.
 */
const place = (width: number, height: number) => {
  if (!popup) {
    return;
  }
  if (mode === "mobile") {
    popup.view.scale.set(1);
    popup.view.position.set(MOBILE_MARGIN, MOBILE_MARGIN_Y);
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
    searchField,
    owner,
    keyDialog,
    showLock,
    layout: mode === "mobile"
      ? { mode, width: width - MOBILE_MARGIN * 2, height: height - MOBILE_MARGIN_Y * 2 }
      : { mode: "desktop" },
  }, carry);
  app.stage.addChild(popup.view);
  place(width, height);
};

/** A DOM field has focus: on phones that is the on-screen keyboard being open. */
const typing = (): boolean => isTextField(document.activeElement);

// A sideways phone is too short for the frame: cover it with a request to turn the phone upright. The app keeps
// running underneath, so turning back restores everything as it was.
const coarsePointer = window.matchMedia("(pointer: coarse)");
const uprightNotice = createUprightNotice();
document.body.appendChild(uprightNotice);

const layout = (width: number, height: number) => {
  backdrop.resize(width, height);
  const upright = needsUpright(width, height, coarsePointer.matches);
  if (upright && uprightNotice.hidden && document.activeElement instanceof HTMLElement) {
    // Close the keyboard: the fields under the notice can't be reached.
    document.activeElement.blur();
  }
  uprightNotice.hidden = !upright;
  const next = layoutMode(width, height, FOOTPRINT);
  // Some phones shrink the window for the on-screen keyboard instead of only the visual viewport. While a note
  // is being typed (or a search), a height-only change is the keyboard: keep the frame and let the keyboard handling
  // lift it.
  const modeChanged = next !== mode;
  const keyboard = !modeChanged && next === "mobile" && width === built.width && typing();
  const resized = width !== built.width || height !== built.height;
  if (modeChanged || (next === "mobile" && !keyboard && resized)) {
    mode = next;
    build(width, height);
    if (modeChanged) {
      backHistory.layoutChanged();
    }
  }
  place(width, height);
};
const relayout = () => layout(app.screen.width, app.screen.height);
// Before the first layout: a mode change during it reports to the back-gesture history.
const backHistory = syncBackHistory(store, () => mode === "mobile");
app.renderer.on("resize", layout);
relayout();
// A resize skipped while typing is applied once the field lets go.
[notesField.element, searchField.element].forEach((field) => field.addEventListener("blur", relayout));

// For the logged-in owner, clicking outside the window, or pressing B, cycles the background scene for everyone.
const cycleBackground = () => void owner.setBackground(nextBackground(store.get().background));
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
    cycleBackground();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "b" && !isTextField(event.target)) {
    cycleBackground();
  } else if (event.key === "Escape" && !event.isComposing && !(event.target instanceof HTMLTextAreaElement)
    && store.get().search !== null) {
    // The notes field takes its own Escape (cancel the edit); anywhere else it closes search and clears the filter.
    store.set({ search: null });
  }
});

window.debug = { ...window.debug, store, backdrop };
