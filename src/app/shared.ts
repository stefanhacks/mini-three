import { DEFAULT_BACKGROUND } from "../ui/art/backgroundNames";
import { readEntries } from "./entries";
import type { Store } from "./store";

export const NOTES_URL = "/api/notes";

/**
 * Loads the owner's notes, Known flags and background scene into the store, once at startup. Anything but a readable
 * answer marks them failed: the app stays usable, without notes and on the default scene.
 */
export const loadShared = async(store: Store, fetchJson: typeof fetch = fetch) => {
  try {
    const response = await fetchJson(NOTES_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${NOTES_URL} answered ${response.status}`);
    }
    const { notes, known, background = DEFAULT_BACKGROUND } = readEntries(await response.json());
    store.set({ notes, known: new Set(known), background, shared: "ready" });
  } catch {
    store.set({ shared: "failed" });
  }
};
