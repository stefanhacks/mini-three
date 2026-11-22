import { BODY_FONT, PALETTE } from "../art";
import { MAX_NOTE_LENGTH } from "../../app/storage";

export interface NotesField {
  /** Shows the field for the note of `key` (a `recipeKey` or `item:<id>`). The text only replaces a different one. */
  open: (key: string, text: string) => void;
  /** Hides the field, and blurs it. */
  close: () => void;
  /** Focuses the open field with the caret at the end, without letting the browser scroll the page. */
  focus: () => void;
  /** The height the whole text needs at `width` (unscaled px), or 0 while the field is hidden. */
  measure: (width: number) => number;
  /**
   * Puts the field at a screen rectangle in CSS pixels. `width` and `height` are the unscaled size, `scale` is the
   * popup's world scale: the element is laid out at full size and scaled from its top-left corner, so text, caret
   * and IME follow the canvas art. Cheap to call every frame.
   */
  place: (x: number, y: number, width: number, height: number, scale: number) => void;
  /** Hides an open field without closing it, while its pane moves. Hiding blurs it. */
  setVisible: (visible: boolean) => void;
  /** Font size in CSS px. Phones get 16: iOS zooms the page into any smaller field on focus. */
  setTextSize: (size: number) => void;
  element: HTMLTextAreaElement;
}

export const NOTES_TEXT_SIZE = 13;
/** iOS Safari zooms into a focused field whose text is under 16 px. */
export const NOTES_TEXT_SIZE_MOBILE = 16;

/** How long after focus() the emulated mouse events of the same tap are still expected. */
const FOCUS_GUARD_MS = 700;

const font = (size: number): string => `${size}px/${size + 4}px ${BODY_FONT.map(quote).join(", ")}`;

const hex = (colour: number): string => `#${colour.toString(16).padStart(6, "0")}`;
// Pixi's TextStyle quotes the shared BODY_FONT entries in place once text exists, so strip quotes before adding them.
const quote = (family: string): string => {
  const bare = family.replace(/["']/g, "");
  return bare.includes(" ") ? `"${bare}"` : bare;
};

export interface NotesFieldHandlers {
  /** Every change of the text, with the key it was opened for. */
  onInput: (key: string, text: string) => void;
  /** Ctrl or Cmd with Enter. */
  onSave: () => void;
  /** Escape. */
  onCancel: () => void;
}

/**
 * The notes `<textarea>`, a real DOM element over the canvas: native typing, IME, selection and mobile keyboards.
 * It only knows its geometry and its current key; the popup decides when it is shown and where.
 */
export const createNotesField = ({ onInput, onSave, onCancel }: NotesFieldHandlers): NotesField => {
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
    padding: "3px 6px",
    border: "0",
    outline: "none",
    resize: "none",
    overflow: "auto",
    background: "rgba(0, 0, 0, 0.35)",
    color: hex(PALETTE.text.body),
    caretColor: hex(PALETTE.text.header),
    font: font(NOTES_TEXT_SIZE),
    transformOrigin: "0 0",
  });

  // The canvas handles its own pointer and wheel input; none of it should reach the popup from here.
  ["pointerdown", "pointerup", "wheel", "click"].forEach((type) => {
    area.addEventListener(type, (event) => event.stopPropagation());
  });

  let key: string | null = null;
  let visible = true;
  let placed = "";
  // Last applied size, so a measurement can put it back.
  let size = { width: "0px", height: "0px" };
  const show = () => {
    const shown = key !== null && visible;
    area.style.display = shown ? "block" : "none";
    if (!shown) {
      area.blur();
    }
  };
  area.addEventListener("keydown", (event) => {
    if (event.isComposing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSave();
    }
  });
  // A tap on the canvas is followed by emulated mouse events, and the mousedown would blur the field that the tap just
  // focused (closing the phone's keyboard). Swallow the mousedown that arrives right after focus().
  let guardUntil = 0;
  document.addEventListener("mousedown", (event) => {
    if (performance.now() < guardUntil && event.target !== area) {
      event.preventDefault();
    }
  }, true);
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
      show();
    },
    close: () => {
      key = null;
      show();
    },
    focus: () => {
      guardUntil = performance.now() + FOCUS_GUARD_MS;
      area.focus({ preventScroll: true });
      area.setSelectionRange(area.value.length, area.value.length);
    },
    measure: (width) => {
      if (area.style.display === "none") {
        return 0;
      }
      // Collapse the field so its scroll height is the text's own, then put the size back.
      Object.assign(area.style, { width: `${width}px`, height: "0px" });
      const needed = area.scrollHeight;
      Object.assign(area.style, size);
      return needed;
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
      size = { width: `${width}px`, height: `${height}px` };
    },
    setVisible: (value) => {
      if (value !== visible) {
        visible = value;
        show();
      }
    },
    setTextSize: (size) => {
      area.style.font = font(size);
    },
    element: area,
  };
};
