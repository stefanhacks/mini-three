import type { LoginResult } from "../app/owner";
import { DISPLAY_FONT, PALETTE } from "./art";
import { FIELD_TEXT_SIZE_MOBILE, font, hex } from "./dom";

export interface KeyDialog {
  /** Shows the dialog with an empty field, focused. */
  open: () => void;
  element: HTMLElement;
}

const MESSAGES: Record<Exclude<LoginResult, "ok">, string> = {
  wrong: "That key doesn't work.",
  unreachable: "The server couldn't be reached. Try again.",
};

const button = (text: string, type: "submit" | "button"): HTMLButtonElement => {
  const element = document.createElement("button");
  element.type = type;
  element.textContent = text;
  Object.assign(element.style, {
    font: `14px "${DISPLAY_FONT}", serif`,
    color: hex(PALETTE.text.header),
    background: hex(type === "submit" ? PALETTE.red.base : PALETTE.stone.raised),
    border: `1px solid ${hex(PALETTE.gold.dark)}`,
    borderRadius: "4px",
    padding: "6px 14px",
    cursor: "pointer",
  });
  return element;
};

/**
 * The owner's login: a DOM form over everything, with a password field a password manager can fill. `login` checks
 * the key; the dialog closes once it works, and says why when it doesn't.
 */
export const createKeyDialog = (login: (key: string) => Promise<LoginResult>): KeyDialog => {
  const overlay = document.createElement("div");
  overlay.hidden = true;
  overlay.className = "key-dialog";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    // Under the upright notice, over the canvas and its fields.
    zIndex: "900",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    background: "rgba(5, 4, 3, 0.7)",
  });

  const form = document.createElement("form");
  form.setAttribute("aria-label", "Teishu login");
  Object.assign(form.style, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "min(320px, 100%)",
    boxSizing: "border-box",
    padding: "16px",
    background: hex(PALETTE.stone.base),
    border: `2px solid ${hex(PALETTE.gold.base)}`,
    borderRadius: "6px",
  });

  const title = document.createElement("div");
  title.textContent = "Teishu Key";
  Object.assign(title.style, { font: `18px "${DISPLAY_FONT}", serif`, color: hex(PALETTE.text.header) });

  // Password managers file a key under a username: a fixed, hidden one.
  const username = document.createElement("input");
  username.type = "text";
  username.name = "username";
  username.autocomplete = "username";
  username.value = "owner";
  username.style.display = "none";

  const input = document.createElement("input");
  input.type = "password";
  input.name = "password";
  input.autocomplete = "current-password";
  input.setAttribute("aria-label", "Teishu Key");
  Object.assign(input.style, {
    boxSizing: "border-box",
    width: "100%",
    padding: "6px 8px",
    // 16 px: iOS zooms into smaller fields.
    font: font(FIELD_TEXT_SIZE_MOBILE),
    color: hex(PALETTE.text.body),
    background: "rgba(0, 0, 0, 0.35)",
    border: `1px solid ${hex(PALETTE.stone.edge)}`,
    outline: "none",
  });

  const message = document.createElement("div");
  message.setAttribute("role", "status");
  Object.assign(message.style, { minHeight: "18px", font: font(13), color: hex(PALETTE.text.error) });

  const cancel = button("Cancel", "button");
  const submit = button("Log in", "submit");
  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", justifyContent: "flex-end", gap: "8px" });
  actions.append(cancel, submit);
  form.append(title, username, input, message, actions);
  overlay.append(form);
  document.body.appendChild(overlay);

  const close = () => {
    input.blur();
    input.value = "";
    overlay.hidden = true;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const key = input.value.trim();
    if (key === "" || submit.disabled) {
      return;
    }
    submit.disabled = true;
    message.textContent = "Checking…";
    void login(key).then((result) => {
      submit.disabled = false;
      message.textContent = result === "ok" ? "" : MESSAGES[result];
      if (result === "ok") {
        close();
      }
    });
  });
  cancel.addEventListener("click", close);
  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  // Escape closes the dialog, and goes no further (it would also close search).
  overlay.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      close();
    }
  });

  return {
    open: () => {
      message.textContent = "";
      overlay.hidden = false;
      input.focus({ preventScroll: true });
    },
    element: overlay,
  };
};
