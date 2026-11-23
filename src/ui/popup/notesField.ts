import { MAX_NOTE_LENGTH } from "../../app/storage";
import { type OverlayField, createOverlayField } from "../dom";

export interface NotesField extends Omit<OverlayField, "open" | "placedSize"> {
  /** Shows the field for the note of `key` (a `recipeKey` or `itemKey`). The text only replaces a different one. */
  open: (key: string, text: string) => void;
  /** The height the whole text needs at `width` (unscaled px), or 0 while the field is hidden. */
  measure: (width: number) => number;
  element: HTMLTextAreaElement;
}

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
  area.setAttribute("aria-label", "Notes");
  const { open, close, placedSize, ...field } = createOverlayField(area, {
    padding: "3px 6px",
    border: "0",
    resize: "none",
    overflow: "auto",
  });

  let key: string | null = null;
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
  area.addEventListener("input", () => {
    if (key !== null) {
      onInput(key, area.value);
    }
  });

  return {
    ...field,
    open: (nextKey, text) => {
      key = nextKey;
      open(text);
    },
    close: () => {
      key = null;
      close();
    },
    measure: (width) => {
      if (area.style.display === "none") {
        return 0;
      }
      // Collapse the field so its scroll height is the text's own, then put the size back.
      Object.assign(area.style, { width: `${width}px`, height: "0px" });
      const needed = area.scrollHeight;
      Object.assign(area.style, placedSize());
      return needed;
    },
    element: area,
  };
};
