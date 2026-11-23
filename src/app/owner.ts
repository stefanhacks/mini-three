import { type EntryChange, readEntries } from "./entries";
import { type SavedChange, saveEdit, withChange } from "./notesEdit";
import { NOTES_URL } from "./shared";
import type { Store } from "./store";

export const SESSION_URL = "/api/session";
const KEY_STORAGE = "hanto:key";

export type LoginResult = "ok" | "wrong" | "unreachable";

/** Where the key survives a reload. Blocked or throwing storage just forgets it. */
export interface KeyStorage {
  get: () => string | null;
  set: (key: string | null) => void;
}

const browserKeyStorage: KeyStorage = {
  get: () => {
    try {
      return window.localStorage.getItem(KEY_STORAGE);
    } catch {
      return null;
    }
  },
  set: (key) => {
    try {
      if (key === null) {
        window.localStorage.removeItem(KEY_STORAGE);
      } else {
        window.localStorage.setItem(KEY_STORAGE, key);
      }
    } catch {
      // The login still works until the page closes.
    }
  },
};

const FAILURES: Record<number, string> = {
  401: "Not saved: the key no longer works. Log in again.",
  409: "Not saved: another save got in the way. Try again.",
};
const UNREACHABLE = "Not saved: the server couldn't be reached.";

export interface Owner {
  /** A key from an earlier login is kept: this browser is the owner's, though `restore` may yet find it stale. */
  remembered: () => boolean;
  /** Logs in again with the key an earlier login kept, once at startup, if the server still takes it. */
  restore: () => Promise<void>;
  /** Checks `key` with the server and, if it is the edit key, keeps it and allows editing. */
  login: (key: string) => Promise<LoginResult>;
  /** Forgets the key and stops editing. */
  logout: () => void;
  /**
   * Saves the edit in progress: shown at once, then sent. A refused change is undone, with a message. Resolves once
   * every save sent so far has its answer.
   */
  save: () => Promise<void>;
}

/** The owner's session: logging in and out, and sending saves to the server one at a time, in order. */
export const createOwner = (store: Store, fetchJson: typeof fetch = fetch, keys = browserKeyStorage): Owner => {
  let key: string | null = null;
  let pending = 0;
  let queue = Promise.resolve();

  const check = async(candidate: string): Promise<LoginResult> => {
    try {
      const response = await fetchJson(SESSION_URL, {
        headers: { authorization: `Bearer ${candidate}` }, cache: "no-store",
      });
      return response.status === 204 ? "ok" : response.status === 401 ? "wrong" : "unreachable";
    } catch {
      return "unreachable";
    }
  };

  const allow = (granted: string) => {
    key = granted;
    keys.set(granted);
    store.set({ canEdit: true });
  };

  const logout = () => {
    key = null;
    keys.set(null);
    store.set({ canEdit: false });
  };

  /**
   * Sends one change, and returns why it failed, or null. On success the server's entries replace the shown ones,
   * once no other save is waiting.
   */
  const send = async(change: EntryChange): Promise<string | null> => {
    try {
      const response = await fetchJson(NOTES_URL, {
        method: "PUT",
        headers: { authorization: `Bearer ${key ?? ""}`, "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      if (response.ok) {
        const { notes, known } = readEntries(await response.json());
        if (pending === 1) {
          store.set({ notes, known: new Set(known) });
        }
        return null;
      }
      if (response.status === 401) {
        logout();
      }
      return FAILURES[response.status] ?? `Not saved: the server answered ${response.status}.`;
    } catch {
      return UNREACHABLE;
    }
  };

  const push = async({ change, undo }: SavedChange) => {
    const message = await send(change);
    if (message !== null) {
      store.set({ ...withChange(store.get(), undo), saveError: { key: change.key, message } });
    }
  };

  return {
    remembered: () => keys.get() !== null,
    restore: async() => {
      const saved = keys.get();
      if (saved === null) {
        return;
      }
      const result = await check(saved);
      if (result === "ok") {
        allow(saved);
      } else if (result === "wrong") {
        keys.set(null);
      }
    },
    login: async(candidate) => {
      const result = await check(candidate);
      if (result === "ok") {
        allow(candidate);
      }
      return result;
    },
    logout,
    save: () => {
      saveEdit(store).forEach((saved) => {
        pending += 1;
        queue = queue.then(() => push(saved)).finally(() => {
          pending -= 1;
        });
      });
      return queue;
    },
  };
};
