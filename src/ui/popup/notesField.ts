import { BODY_FONT, PALETTE } from "../art";
import { MAX_NOTE_LENGTH } from "../../app/storage";

export interface NotesField {
  /** Shows the field with the note of `key` (a `recipeKey` or `item:<id>`), replacing whatever it held. */
  open: (key: string, text: string) => void;
  /** Hides the field. The text was already handed to `onInput`, so nothing is lost. */
  close: () => void;
  /**
   * Puts the field at a screen rectangle in CSS pixels. `width` and `height` are the unscaled size, `scale` is the
   * popup's world scale: the element is laid out at full size and scaled from its top-left corner, so text, caret
   * and IME follow the canvas art. Cheap to call every frame.
   */
  place: (x: number, y: number, width: number, height: number, scale: number) => void;
}

const FONT_SIZE = 13;

const hex = (colour: number): string => `#${colour.toString(16).padStart(6, "0")}`;
const quote = (family: string): string => family.includes(" ") ? `"${family}"` : family;

/**
 * The notes `<textarea>`, a real DOM element over the canvas: native typing, IME, selection and mobile keyboards.
 * It only knows its geometry and its current key; the popup decides when it is shown and where.
 */
export const createNotesField = (onInput: (key: string, text: string) => void): NotesField => {
  const area = document.createElement("textarea");
  area.maxLength = MAX_NOTE_LENGTH;
  area.spellcheck = false;
  area.setAttribute("aria-label", "Notes");
  Object.assign(area.style, {
    position: "fixed",
    left: "0",
    top: "0",
    display: "none",
    boxSizing: "border-box",
    margin: "0",
    padding: "0",
    border: "0",
    outline: "none",
    resize: "none",
    overflow: "auto",
    background: "rgba(0, 0, 0, 0.35)",
    color: hex(PALETTE.text.body),
    caretColor: hex(PALETTE.text.header),
    font: `${FONT_SIZE}px/17px ${BODY_FONT.map(quote).join(", ")}`,
    transformOrigin: "0 0",
  });

  // The canvas handles its own pointer and wheel input; none of it should reach the popup from here.
  ["pointerdown", "pointerup", "wheel", "click"].forEach((type) => {
    area.addEventListener(type, (event) => event.stopPropagation());
  });

  let key: string | null = null;
  let placed = "";
  area.addEventListener("input", () => {
    if (key !== null) {
      onInput(key, area.value);
    }
  });
  document.body.appendChild(area);

  return {
    open: (nextKey, text) => {
      key = nextKey;
      if (area.value !== text) {
        area.value = text;
      }
      area.style.display = "block";
    },
    close: () => {
      key = null;
      area.style.display = "none";
      area.blur();
    },
    place: (x, y, width, height, scale) => {
      const next = `${x}|${y}|${width}|${height}|${scale}`;
      if (next === placed) {
        return;
      }
      placed = next;
      Object.assign(area.style, {
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        width: `${width}px`,
        height: `${height}px`,
      });
    },
  };
};
