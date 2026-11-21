import "./style.css";
import { Application } from "pixi.js";
import { createShowcase } from "./showcase";
import { PALETTE, createArtKit, loadFonts } from "./ui/art";

const MAX_RESOLUTION = 2;

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
createShowcase(app, kit);
