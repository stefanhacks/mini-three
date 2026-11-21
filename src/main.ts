import "./style.css";
import { Application } from "pixi.js";
import { fromSaved, loadSaved, persist } from "./app/storage";
import { createStore } from "./app/store";
import { professions } from "./data";
import { PALETTE, createArtKit, createBackdrop, loadFonts } from "./ui/art";
import { TABS_WIDTH, WINDOW_HEIGHT, WINDOW_WIDTH, createPopup } from "./ui/popup/popup";

const MAX_RESOLUTION = 2;
const MARGIN = 12;
// Room for the portrait medallion that pokes out of the top-left corner.
const CORNER = 16;

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
const popup = createPopup(kit, store);
app.stage.addChild(backdrop.view, popup);

// Clicking outside the window, or pressing B, cycles the background scene.
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
app.stage.on("pointertap", (event) => {
  if (!popup.getBounds().containsPoint(event.global.x, event.global.y)) {
    backdrop.next();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "b" && !(event.target instanceof HTMLTextAreaElement)) {
    backdrop.next();
  }
});

const layout = (width: number, height: number) => {
  backdrop.resize(width, height);
  const fullWidth = WINDOW_WIDTH + TABS_WIDTH + CORNER;
  const fullHeight = WINDOW_HEIGHT + CORNER;
  const scale = Math.min(1, (width - MARGIN * 2) / fullWidth, (height - MARGIN * 2) / fullHeight);
  popup.scale.set(scale);
  popup.position.set(
    Math.round((width - fullWidth * scale) / 2 + CORNER * scale),
    Math.round((height - fullHeight * scale) / 2 + CORNER * scale),
  );
};
app.renderer.on("resize", layout);
layout(app.screen.width, app.screen.height);

window.debug = { ...window.debug, store, backdrop };
