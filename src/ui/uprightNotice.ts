import { DISPLAY_FONT, PALETTE } from "./art";
import { font, hex } from "./popup/notesField";

/**
 * A full-screen DOM notice asking to turn the phone upright, over the canvas and its DOM fields. It starts hidden;
 * main.ts shows it while a phone is held sideways. It takes every touch, so nothing underneath reacts.
 */
export const createUprightNotice = (): HTMLDivElement => {
  const notice = document.createElement("div");
  notice.hidden = true;
  notice.setAttribute("role", "alert");
  notice.className = "upright-notice";
  Object.assign(notice.style, {
    position: "fixed",
    inset: "0",
    zIndex: "1000",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "16px",
    textAlign: "center",
    background: "rgba(5, 4, 3, 0.96)",
    touchAction: "none",
  });

  // A phone outline turned upright, drawn with borders so there are no image files.
  const phone = document.createElement("div");
  Object.assign(phone.style, {
    width: "28px",
    height: "48px",
    border: `3px solid ${hex(PALETTE.gold.base)}`,
    borderRadius: "6px",
    marginBottom: "6px",
  });

  const title = document.createElement("div");
  title.textContent = "Turn your phone upright";
  Object.assign(title.style, {
    font: `20px "${DISPLAY_FONT}", serif`,
    color: hex(PALETTE.text.header),
  });

  const body = document.createElement("div");
  body.textContent = "The profession window needs more height than this view has.";
  Object.assign(body.style, {
    font: font(14),
    color: hex(PALETTE.text.muted),
  });

  notice.append(phone, title, body);
  return notice;
};
