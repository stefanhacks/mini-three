import { PALETTE } from "../art";
import { NOTES_TEXT_SIZE, font, hex } from "./notesField";

export interface SearchField {
  /** Shows the field with `text`. The text only replaces a different one, so a rebuild keeps the caret. */
  open: (text: string) => void;
  /** Hides the field, and blurs it. */
  close: () => void;
  /** Focuses the open field with the caret at the end, without letting the browser scroll the page. */
  focus: () => void;
  /** Puts the field at a screen rectangle in CSS pixels; `width` and `height` are unscaled, `scale` the popup's. */
  place: (x: number, y: number, width: number, height: number, scale: number) => void;
  /** Hides an open field without closing it (the mobile detail pane covers it). Hiding blurs it. */
  setVisible: (visible: boolean) => void;
  /** Font size in CSS px. Phones get 16: iOS zooms the page into any smaller field on focus. */
  setTextSize: (size: number) => void;
  element: HTMLInputElement;
}

export const SEARCH_TEXT_SIZE = NOTES_TEXT_SIZE;

/** How long after focus() the emulated mouse events of the same tap are still expected. */
const FOCUS_GUARD_MS = 700;

/**
 * The search `<input>`, a real DOM element over the canvas like the notes textarea. It only reports its text; the
 * popup decides when it is open and where it sits. Escape is handled in main.ts, with the other global keys.
 */
export const createSearchField = (onInput: (text: string) => void): SearchField => {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 60;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.enterKeyHint = "search";
  input.placeholder = "Search";
  input.className = "search-field";
  input.setAttribute("aria-label", "Search");
  Object.assign(input.style, {
    position: "fixed",
    left: "0",
    top: "0",
    display: "none",
    boxSizing: "border-box",
    margin: "0",
    padding: "0 8px",
    border: `1px solid ${hex(PALETTE.stone.edge)}`,
    outline: "none",
    background: "rgba(0, 0, 0, 0.35)",
    color: hex(PALETTE.text.body),
    caretColor: hex(PALETTE.text.header),
    font: font(SEARCH_TEXT_SIZE),
    transformOrigin: "0 0",
  });

  // The canvas handles its own pointer and wheel input; none of it should reach the popup from here.
  ["pointerdown", "pointerup", "wheel", "click"].forEach((type) => {
    input.addEventListener(type, (event) => event.stopPropagation());
  });
  // Enter dismisses the phone's keyboard and keeps the filter.
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      input.blur();
    }
  });
  input.addEventListener("input", () => onInput(input.value));
  input.addEventListener("focus", () => {
    input.style.borderColor = hex(PALETTE.gold.dark);
  });
  input.addEventListener("blur", () => {
    input.style.borderColor = hex(PALETTE.stone.edge);
  });

  // A tap on the canvas is followed by emulated mouse events, and the mousedown would blur the field that the tap
  // just focused (closing the phone's keyboard). Swallow the mousedown that arrives right after focus().
  let guardUntil = 0;
  document.addEventListener("mousedown", (event) => {
    // Only canvas presses: a press on another DOM field (the notes textarea) must still focus it.
    if (performance.now() < guardUntil && !(event.target instanceof HTMLInputElement)
      && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
    }
  }, true);

  let isOpen = false;
  let visible = true;
  let placed = "";
  const show = () => {
    const shown = isOpen && visible;
    input.style.display = shown ? "block" : "none";
    if (!shown) {
      input.blur();
    }
  };
  document.body.appendChild(input);

  return {
    open: (text) => {
      isOpen = true;
      if (input.value !== text) {
        input.value = text;
      }
      show();
    },
    close: () => {
      isOpen = false;
      show();
    },
    focus: () => {
      guardUntil = performance.now() + FOCUS_GUARD_MS;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    },
    place: (x, y, width, height, scale) => {
      const next = `${x}|${y}|${width}|${height}|${scale}`;
      if (next === placed) {
        return;
      }
      placed = next;
      Object.assign(input.style, {
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        width: `${width}px`,
        height: `${height}px`,
      });
    },
    setVisible: (value) => {
      if (value !== visible) {
        visible = value;
        show();
      }
    },
    setTextSize: (size) => {
      input.style.font = font(size);
    },
    element: input,
  };
};
