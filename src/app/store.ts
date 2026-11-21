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
}

export interface Store {
  get: () => AppState;
  set: (patch: Partial<AppState>) => void;
  subscribe: (listener: (state: AppState, previous: AppState) => void) => void;
}

/** A tiny observable state holder. Stage 4 adds persistence on top of `subscribe`. */
export const createStore = (initial: AppState): Store => {
  let state = initial;
  const listeners: ((state: AppState, previous: AppState) => void)[] = [];
  return {
    get: () => state,
    set: (patch) => {
      const previous = state;
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener(state, previous));
    },
    subscribe: (listener) => {
      listeners.push(listener);
    },
  };
};
