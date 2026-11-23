import { PALETTE } from "../art";
import { type OverlayField, createOverlayField, hex } from "../dom";

export interface SearchField extends Omit<OverlayField, "placedSize"> {
  element: HTMLInputElement;
}

/**
 * The search `<input>`, a real DOM element over the canvas like the notes textarea. It only reports its text; the
 * popup decides when it is open and where it sits. Escape is handled in main.ts, with the other global keys.
 */
export const createSearchField = (onInput: (text: string) => void): SearchField => {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 60;
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.enterKeyHint = "search";
  input.placeholder = "Search";
  input.className = "search-field";
  input.setAttribute("aria-label", "Search");
  const { placedSize: _placedSize, ...field } = createOverlayField(input, {
    padding: "0 8px",
    border: `1px solid ${hex(PALETTE.stone.edge)}`,
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

  return { ...field, element: input };
};
