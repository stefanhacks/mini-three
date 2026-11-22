import type { ProfessionKey } from "../data";
import type { Selection } from "../ui/popup/detail";

export interface AppState {
  /** Professions the user picked, in picker order. Their tabs are the only tabs. */
  chosen: ProfessionKey[];
  active: ProfessionKey | null;
  selection: Selection;
  /** Collapsed list section ids. */
  collapsed: ReadonlySet<string>;
  view: "picker" | "list";
  /** The mobile layout shows the detail pane over the list. Transient; desktop always shows both. */
  detailOpen: boolean;
  /** `recipeKey`s of the recipes marked as known. Saved. */
  known: ReadonlySet<string>;
  /** Show only known recipes in the list. Saved. */
  knownOnly: boolean;
  /** Notes by `recipeKey` (recipes) or `item:<id>` (items). Saved. */
  notes: Readonly<Record<string, string>>;
  /** The note being edited and its unsaved text. Transient: never saved, and cleared when the entry is left. */
  editing: { key: string; draft: string } | null;
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
