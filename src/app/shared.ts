import { readEntries } from "./entries";
import type { Store } from "./store";

export const NOTES_URL = "/api/notes";

/**
 * Loads the owner's notes and Known flags into the store, once at startup. Anything but a readable answer marks them
 * failed: the app stays usable, without notes.
 */
export const loadShared = async(store: Store, fetchJson: typeof fetch = fetch) => {
  try {
    const response = await fetchJson(NOTES_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${NOTES_URL} answered ${response.status}`);
    }
    const { notes, known } = readEntries(await response.json());
    store.set({ notes, known: new Set(known), shared: "ready" });
  } catch {
    store.set({ shared: "failed" });
  }
};
