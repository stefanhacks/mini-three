import type { ProfessionKey } from "../data";
import { PROFESSION_KEYS } from "../data/keys";
import { isRecord, strings } from "./entries";
import type { AppState, Store } from "./store";

export const STORAGE_KEY = "hanto:v1";
const VERSION = 1;
const SAVE_DELAY = 300;

/**
 * What this browser remembers across a reload: how the visitor last looked at the list. Plain JSON types only; sets
 * become arrays. Notes and Known flags are the owner's and come from the server.
 */
export interface SavedData {
  active: ProfessionKey;
  collapsed: string[];
  /** Professions with Known only on. */
  knownOnly: ProfessionKey[];
}

export const emptySaved = (): SavedData => ({ active: PROFESSION_KEYS[0], collapsed: [], knownOnly: [] });

export const serialize = (data: SavedData): string => JSON.stringify({ version: VERSION, ...data });

/**
 * Reads saved data back. Anything unreadable (not JSON, another version, wrong types) gives a clean start, and bad
 * pieces inside valid data are dropped one by one. Never throws. `validKeys` are the professions that exist.
 * Older saves also hold notes, Known flags and `chosen` (the profession picker's): all ignored, and dropped from
 * storage on the next save. Saves from before Known only was per profession hold it as a boolean: `true` turns it on
 * for the saved active profession only.
 */
export const parse = (raw: string | null, validKeys: ReadonlySet<string>): SavedData => {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(data) || data.version !== VERSION) {
      return emptySaved();
    }
    const isProfession = (key: string) => validKeys.has(key);
    const active = typeof data.active === "string" && isProfession(data.active)
      ? data.active as ProfessionKey : PROFESSION_KEYS[0];
    return {
      active,
      collapsed: strings(data.collapsed),
      knownOnly: data.knownOnly === true ? [active]
        : [...new Set(strings(data.knownOnly).filter(isProfession))] as ProfessionKey[],
    };
  } catch {
    return emptySaved();
  }
};

export const toSaved = (state: AppState): SavedData => ({
  active: state.active,
  collapsed: [...state.collapsed],
  knownOnly: [...state.knownOnly],
});

/** The saved part of the state, with the rest at its start: no notes until the server sends them, not editing. */
export const fromSaved = (data: SavedData): AppState => ({
  active: data.active,
  selection: null,
  collapsed: new Set(data.collapsed),
  detailOpen: false,
  known: new Set(),
  knownOnly: new Set(data.knownOnly),
  search: null,
  notes: {},
  shared: "loading",
  canEdit: false,
  saveError: null,
  editing: null,
});

/** Reads `localStorage`. Blocked or throwing storage counts as empty. */
export const loadSaved = (validKeys: ReadonlySet<string>): SavedData => {
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY), validKeys);
  } catch {
    return emptySaved();
  }
};

const write = (state: AppState) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize(toSaved(state)));
  } catch {
    // Blocked or full storage: the app keeps working, it just doesn't remember.
  }
};

const savedFieldsChanged = (a: AppState, b: AppState): boolean =>
  a.active !== b.active || a.collapsed !== b.collapsed || a.knownOnly !== b.knownOnly;

/** Saves the store about 300 ms after its last saved-field change, and right away when the page is hidden. */
export const persist = (store: Store) => {
  let timer: number | undefined;
  let dirty = false;
  const flush = () => {
    window.clearTimeout(timer);
    if (dirty) {
      dirty = false;
      write(store.get());
    }
  };
  store.subscribe((state, previous) => {
    if (savedFieldsChanged(state, previous)) {
      dirty = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, SAVE_DELAY);
    }
  });
  window.addEventListener("pagehide", flush);
  // Mobile browsers often background a tab without `pagehide`, then discard it.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush();
    }
  });
};
