import { BODY_FONT, PALETTE } from "./art";

/** Text size of the DOM fields over the canvas. */
export const FIELD_TEXT_SIZE = 13;
/** iOS Safari zooms into a focused field whose text is under 16 px. */
export const FIELD_TEXT_SIZE_MOBILE = 16;

/** How long after focus() the emulated mouse events of the same tap are still expected. */
const FOCUS_GUARD_MS = 700;

export const hex = (colour: number): string => `#${colour.toString(16).padStart(6, "0")}`;

// Pixi's TextStyle quotes the shared BODY_FONT entries in place once text exists, so strip quotes before adding them.
const quote = (family: string): string => {
  const bare = family.replace(/["']/g, "");
  return bare.includes(" ") ? `"${bare}"` : bare;
};

export const font = (size: number): string => `${size}px/${size + 4}px ${BODY_FONT.map(quote).join(", ")}`;

export const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

/** How much of a field to cut off at its top and bottom, in unscaled px (it scrolled past the pane's edge). */
export interface Clip {
  top: number;
  bottom: number;
}

const NO_CLIP: Clip = { top: 0, bottom: 0 };

export interface OverlayField {
  /** Shows the field with `text`. The text only replaces a different one, so a rebuild keeps the caret. */
  open: (text: string) => void;
  /** Hides the field, and blurs it. */
  close: () => void;
  /** Focuses the open field with the caret at the end, without letting the browser scroll the page. */
  focus: () => void;
  /**
   * Puts the field at a screen rectangle in CSS pixels. `width` and `height` are the unscaled size, `scale` is the
   * popup's world scale: the element is laid out at full size and scaled from its top-left corner, so text, caret
   * and IME follow the canvas art. Cheap to call every frame.
   */
  place: (x: number, y: number, width: number, height: number, scale: number, clip?: Clip) => void;
  /** The size the last `place` gave, as CSS values. */
  placedSize: () => { width: string; height: string };
  /** Hides an open field without closing it (its pane moves or covers it). Hiding blurs it. */
  setVisible: (visible: boolean) => void;
  /** Font size in CSS px. Phones get 16: iOS zooms the page into any smaller field on focus. */
  setTextSize: (size: number) => void;
}

/**
 * The behaviour shared by the DOM fields laid over the canvas (notes textarea, search input): fixed at the layout
 * viewport's top-left and moved with a transform, shown only while open and visible, and kept out of the canvas's
 * pointer handling. `style` adds to the shared look.
 */
export const createOverlayField = (
  element: HTMLInputElement | HTMLTextAreaElement, style: Partial<CSSStyleDeclaration>,
): OverlayField => {
  element.spellcheck = false;
  Object.assign(element.style, {
    position: "fixed",
    left: "0",
    top: "0",
    display: "none",
    boxSizing: "border-box",
    margin: "0",
    outline: "none",
    background: "rgba(0, 0, 0, 0.35)",
    color: hex(PALETTE.text.body),
    caretColor: hex(PALETTE.text.header),
    font: font(FIELD_TEXT_SIZE),
    transformOrigin: "0 0",
    ...style,
  });

  // The canvas handles its own pointer and wheel input; none of it should reach the popup from here.
  ["pointerdown", "pointerup", "wheel", "click"].forEach((type) => {
    element.addEventListener(type, (event) => event.stopPropagation());
  });

  // A tap on the canvas is followed by emulated mouse events, and the mousedown would blur the field that the tap
  // just focused (closing the phone's keyboard). Swallow the canvas mousedown that arrives right after focus(); a
  // press on another DOM field must still focus it.
  let guardUntil = 0;
  document.addEventListener("mousedown", (event) => {
    if (performance.now() < guardUntil && !isTextField(event.target)) {
      event.preventDefault();
    }
  }, true);

  let isOpen = false;
  let visible = true;
  let placed = "";
  let size = { width: "0px", height: "0px" };
  const show = () => {
    const shown = isOpen && visible;
    element.style.display = shown ? "block" : "none";
    if (!shown) {
      element.blur();
    }
  };
  document.body.appendChild(element);

  return {
    open: (text) => {
      isOpen = true;
      if (element.value !== text) {
        element.value = text;
      }
      show();
    },
    close: () => {
      isOpen = false;
      show();
    },
    focus: () => {
      guardUntil = performance.now() + FOCUS_GUARD_MS;
      element.focus({ preventScroll: true });
      element.setSelectionRange(element.value.length, element.value.length);
    },
    place: (x, y, width, height, scale, clip = NO_CLIP) => {
      const next = `${x}|${y}|${width}|${height}|${scale}|${clip.top}|${clip.bottom}`;
      if (next === placed) {
        return;
      }
      placed = next;
      size = { width: `${width}px`, height: `${height}px` };
      Object.assign(element.style, {
        ...size,
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        clipPath: clip.top > 0 || clip.bottom > 0 ? `inset(${clip.top}px 0 ${clip.bottom}px 0)` : "",
      });
    },
    placedSize: () => size,
    setVisible: (value) => {
      if (value !== visible) {
        visible = value;
        show();
      }
    },
    setTextSize: (textSize) => {
      element.style.font = font(textSize);
    },
  };
};
