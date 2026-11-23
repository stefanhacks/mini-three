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
  state.editing !== null && state.editing.key === selectedKey && state.detailOpen;

/** `known` with `key` added or removed. */
export const withKnown = (known: AppState["known"], key: string, isKnown: boolean): AppState["known"] => {
  const next = new Set(known);
  if (isKnown) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return next;
};

/** Starts editing `key`. `isRecipe` adds the known flag to the draft, since only recipes have one. */
export const startEdit = (store: Store, key: string, isRecipe: boolean) => {
  const { notes, known } = store.get();
  store.set({ editing: { key, draft: notes[key] ?? "", ...(isRecipe ? { known: known.has(key) } : {}) } });
};

export const setDraft = (store: Store, key: string, draft: string) => {
  const { editing } = store.get();
  if (editing?.key === key) {
    store.set({ editing: { ...editing, draft } });
  }
};

/** The Known checkbox in edit mode: changes the draft only; Save keeps it, Cancel drops it. */
export const setKnownDraft = (store: Store, isKnown: boolean) => {
  const { editing } = store.get();
  if (editing && editing.known !== undefined) {
    store.set({ editing: { ...editing, known: isKnown } });
  }
};

export const saveEdit = (store: Store) => {
  const { editing, notes, known } = store.get();
  if (editing) {
    store.set({
      notes: withNote(notes, editing.key, noteFromDraft(editing.draft)),
      ...(editing.known !== undefined && editing.known !== known.has(editing.key)
        ? { known: withKnown(known, editing.key, editing.known) } : {}),
      editing: null,
    });
  }
};

export const cancelEdit = (store: Store) => {
  if (store.get().editing) {
    store.set({ editing: null });
  }
};

/**
 * Leaving the entry being edited (another row, a tab, Back) cancels the edit. Subscribe it before any
 * view, so they only ever see a state whose edit is valid. `selectedKey` is the key of the state's selection.
 */
export const cancelEditOnLeave = (store: Store, selectedKey: (state: AppState) => string | null) =>
  store.subscribe((state) => {
    if (state.editing && !editStillValid(state, selectedKey(state))) {
      store.set({ editing: null });
    }
  });
