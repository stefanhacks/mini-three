import { Assets, type LoadFontData, type UnresolvedAsset } from "pixi.js";

/** Display face for titles, headers and buttons: Marcellus (SIL OFL), self-hosted in `public/fonts`. */
export const DISPLAY_FONT = "Marcellus";

/**
 * Body face for rows, descriptions and numbers: the platform's UI sans-serif. It is hinted for small sizes,
 * has full Unicode coverage for item names and user notes, costs no download, and matches the DOM
 * textarea used for notes.
 */
export const BODY_FONT = ["Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"];

const FONT_BASE = `${import.meta.env.BASE_URL}fonts/`;

// The same subsets and ranges Google Fonts serves, so the browser only fetches latin-ext when a glyph needs it.
const MARCELLUS_FACES: UnresolvedAsset<Partial<LoadFontData>>[] = [
  {
    src: `${FONT_BASE}Marcellus-Regular-latin.woff2`,
    data: {
      family: DISPLAY_FONT,
      unicodeRange: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, "
        + "U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  },
  {
    src: `${FONT_BASE}Marcellus-Regular-latin-ext.woff2`,
    data: {
      family: DISPLAY_FONT,
      unicodeRange: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, "
        + "U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  },
];

/**
 * Loads the display font through Pixi's web-font loader (FontFace + document.fonts). Await it before creating
 * any `Text`, or Pixi measures and caches metrics for the fallback face.
 */
export const loadFonts = async(): Promise<void> => {
  await Assets.load(MARCELLUS_FACES);
};
