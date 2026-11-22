import { MAX_NOTE_LENGTH } from "./storage";
import type { AppState, Store } from "./store";

/** The note text a draft saves as: trimmed, and within the saved length. */
export const noteFromDraft = (draft: string): string => draft.trim().slice(0, MAX_NOTE_LENGTH);

/** `notes` with `key` set to `text`; an empty text removes the entry, as storage never keeps empty notes. */
export const withNote = (notes: AppState["notes"], key: string, text: string): AppState["notes"] => {
  const next = { ...notes };
  if (text === "") {
    delete next[key];
  } else {
    next[key] = text;
  }
  return next;
};

/** Whether an edit of `key` may continue in `state`: the entry is still the one shown, in an open detail pane. */
export const editStillValid = (state: AppState, selectedKey: string | null): boolean =>
  state.editing !== null && state.editing.key === selectedKey && state.view === "list" && state.active !== null
  && state.detailOpen;

export const startEdit = (store: Store, key: string) => {
  store.set({ editing: { key, draft: store.get().notes[key] ?? "" } });
};

export const setDraft = (store: Store, key: string, draft: string) => {
  if (store.get().editing?.key === key) {
    store.set({ editing: { key, draft } });
  }
};

export const saveEdit = (store: Store) => {
  const { editing, notes } = store.get();
  if (editing) {
    store.set({ notes: withNote(notes, editing.key, noteFromDraft(editing.draft)), editing: null });
  }
};

export const cancelEdit = (store: Store) => {
  if (store.get().editing) {
    store.set({ editing: null });
  }
};

/**
 * Leaving the entry being edited (another row, a tab, the picker, Back) cancels the edit. Subscribe it before any
 * view, so they only ever see a state whose edit is valid. `selectedKey` is the key of the state's selection.
 */
export const cancelEditOnLeave = (store: Store, selectedKey: (state: AppState) => string | null) =>
  store.subscribe((state) => {
    if (state.editing && !editStillValid(state, selectedKey(state))) {
      store.set({ editing: null });
    }
  });
