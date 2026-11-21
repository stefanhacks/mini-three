import { TextStyle, type TextStyleOptions } from "pixi.js";
import { BODY_FONT, DISPLAY_FONT } from "./fonts";
import { PALETTE } from "./palette";

const SHADOW = {
  color: PALETTE.text.shadow,
  alpha: 0.9,
  angle: Math.PI / 2,
  blur: 1,
  distance: 1,
};

const display = (size: number, fill: number, extra: TextStyleOptions = {}): TextStyle => new TextStyle({
  fontFamily: DISPLAY_FONT,
  fontSize: size,
  fill,
  dropShadow: SHADOW,
  ...extra,
});

const body = (size: number, fill: number, extra: TextStyleOptions = {}): TextStyle => new TextStyle({
  fontFamily: BODY_FONT,
  fontSize: size,
  fill,
  dropShadow: SHADOW,
  ...extra,
});

/** Shared text styles. Create `Text` only after `loadFonts()` resolves. */
export const TEXT_STYLES = {
  title: display(16, PALETTE.text.title, { letterSpacing: 0.5 }),
  header: display(15, PALETTE.text.header),
  itemName: display(17, PALETTE.text.header),
  button: display(13, PALETTE.text.header),
  label: body(12, PALETTE.text.label),
  row: body(13, PALETTE.text.body),
  body: body(13, PALETTE.text.body, { wordWrap: true, wordWrapWidth: 280, lineHeight: 17 }),
  muted: body(12, PALETTE.text.muted),
  bar: body(12, PALETTE.text.body),
};
