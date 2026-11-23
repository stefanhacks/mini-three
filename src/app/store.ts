import type { ProfessionKey } from "../data";
import type { Selection } from "../ui/popup/detail";

export interface AppState {
  /** The open tab. */
  active: ProfessionKey;
  selection: Selection;
  /** Collapsed list section ids. */
  collapsed: ReadonlySet<string>;
  /** The mobile layout shows the detail pane over the list. Transient; desktop always shows both. */
  detailOpen: boolean;
  /** `recipeKey`s of the recipes marked as known. Saved. */
  known: ReadonlySet<string>;
  /** Show only known recipes in the list. Saved. */
  knownOnly: boolean;
  /**
   * The search field: null while closed, else its text (blank shows everything). Filters the active tab's list.
   * Transient: never saved, kept across tabs and layout rebuilds.
   */
  search: string | null;
  /** Notes by `recipeKey` (recipes) or `item:<id>` (items). Saved. */
  notes: Readonly<Record<string, string>>;
  /**
   * The entry being edited: its unsaved note text and, for recipes, its unsaved known flag (absent for items).
   * Transient: never saved, and cleared when the entry is left.
   */
  editing: { key: string; draft: string; known?: boolean } | null;
}

export interface Store {
  get: () => AppState;
  set: (patch: Partial<AppState>) => void;
  /** Returns a function that removes the listener. */
  subscribe: (listener: (state: AppState, previous: AppState) => void) => () => void;
}

/**
 * A tiny observable state holder. `persist` in storage.ts saves it through `subscribe`. A listener removed while
 * others are being notified is not called again, and one added then waits for the next change.
 */
export const createStore = (initial: AppState): Store => {
  let state = initial;
  let listeners: ((state: AppState, previous: AppState) => void)[] = [];
  return {
    get: () => state,
    set: (patch) => {
      const previous = state;
      state = { ...state, ...patch };
      const current = listeners;
      current.forEach((listener) => {
        if (listeners.includes(listener)) {
          listener(state, previous);
        }
      });
    },
    subscribe: (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((entry) => entry !== listener);
      };
    },
  };
};
