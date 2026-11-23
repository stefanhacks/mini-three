import type { ProfessionKey } from "../data";
import { PROFESSION_KEYS } from "../data/keys";
import type { AppState, Store } from "./store";

export const STORAGE_KEY = "hanto:v1";
const VERSION = 1;
const SAVE_DELAY = 300;
export const MAX_NOTE_LENGTH = 1000;

/**
 * What survives a reload. Plain JSON types only; sets become arrays. The selection and any note being edited are
 * transient and not saved.
 */
export interface SavedData {
  active: ProfessionKey;
  collapsed: string[];
  /** `recipeKey`s of known recipes. */
  known: string[];
  knownOnly: boolean;
  /** Notes by `recipeKey` for recipes and `item:<id>` for items. Empty notes are not stored. */
  notes: Record<string, string>;
}

export const emptySaved = (): SavedData => ({
  active: PROFESSION_KEYS[0], collapsed: [], known: [], knownOnly: false, notes: {},
});

export const serialize = (data: SavedData): string => JSON.stringify({ version: VERSION, ...data });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/**
 * Reads saved data back. Anything unreadable (not JSON, another version, wrong types) gives a clean start, and bad
 * pieces inside valid data are dropped one by one. Never throws. `validKeys` are the professions that exist.
 * Saves from before the fixed tabs also hold `chosen` (the picked professions): it is ignored, and their notes and
 * known flags for the five professions carry over.
 */
export const parse = (raw: string | null, validKeys: ReadonlySet<string>): SavedData => {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(data) || data.version !== VERSION) {
      return emptySaved();
    }
    const isProfession = (key: string) => validKeys.has(key);
    // Recipe keys are `<profession>:<recipe id>`, item keys `item:<item id>`.
    const isRecipeKey = (key: string) => /^[a-z-]+:\d+$/.test(key) && isProfession(key.split(":")[0]);
    const isNoteKey = (key: string) => isRecipeKey(key) || /^item:\d+$/.test(key);

    const active = typeof data.active === "string" && isProfession(data.active)
      ? data.active as ProfessionKey : PROFESSION_KEYS[0];
    const notes = isRecord(data.notes)
      ? Object.fromEntries(Object.entries(data.notes).flatMap(([key, text]): [string, string][] =>
        isNoteKey(key) && typeof text === "string" && text !== "" ? [[key, text.slice(0, MAX_NOTE_LENGTH)]] : []))
      : {};
    return {
      active,
      collapsed: strings(data.collapsed),
      known: [...new Set(strings(data.known).filter(isRecipeKey))],
      knownOnly: data.knownOnly === true,
      notes,
    };
  } catch {
    return emptySaved();
  }
};

export const toSaved = (state: AppState): SavedData => ({
  active: state.active,
  collapsed: [...state.collapsed],
  known: [...state.known],
  knownOnly: state.knownOnly,
  notes: { ...state.notes },
});

/** The saved part of the state, with the transient fields at their defaults. */
export const fromSaved = (data: SavedData): AppState => ({
  active: data.active,
  selection: null,
  collapsed: new Set(data.collapsed),
  detailOpen: false,
  known: new Set(data.known),
  knownOnly: data.knownOnly,
  search: null,
  notes: data.notes,
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
  a.active !== b.active || a.collapsed !== b.collapsed || a.known !== b.known
  || a.knownOnly !== b.knownOnly || a.notes !== b.notes;

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
