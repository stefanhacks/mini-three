import { type EntryChange, applyChange, noteFromDraft } from "./entries";
import type { AppState, Store } from "./store";

type Shared = Pick<AppState, "notes" | "known">;

/** The state's notes and Known flags with `change` applied. */
export const withChange = ({ notes, known }: Shared, change: EntryChange): Shared => {
  const next = applyChange({ notes, known: [...known] }, change);
  return { notes: next.notes, known: new Set(next.known) };
};

/** A change Save made, and the change that undoes it if the server refuses it. */
export interface SavedChange {
  change: EntryChange;
  undo: EntryChange;
}

/**
 * Whether an edit of `key` may continue in `state`: the entry is still the one shown, in an open detail pane, and the
 * owner is still logged in.
 */
export const editStillValid = (state: AppState, selectedKey: string | null): boolean =>
  state.editing !== null && state.editing.key === selectedKey && state.detailOpen && state.canEdit;

/**
 * Starts editing `key`, if the owner is logged in. `isRecipe` adds the known flag to the draft, since only recipes
 * have one.
 */
export const startEdit = (store: Store, key: string, isRecipe: boolean) => {
  const { notes, known, canEdit } = store.get();
  if (!canEdit) {
    return;
  }
  store.set({
    editing: { key, draft: notes[key] ?? "", ...(isRecipe ? { known: known.has(key) } : {}) },
    saveError: null,
  });
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

/**
 * Ends the edit, applying what it changed (the note, the Known flag, or both) to the state at once, and returns
 * those changes for the server. A note saved as it was is not a change.
 */
export const saveEdit = (store: Store): SavedChange[] => {
  const { editing, notes, known } = store.get();
  if (!editing) {
    return [];
  }
  const { key } = editing;
  const before = notes[key] ?? "";
  const note = noteFromDraft(editing.draft);
  const changes: SavedChange[] = [
    ...(note !== before ? [{ change: { key, note }, undo: { key, note: before } }] : []),
    ...(editing.known !== undefined && editing.known !== known.has(key)
      ? [{ change: { key, known: editing.known }, undo: { key, known: !editing.known } }] : []),
  ];
  const next = changes.reduce((shared, { change }) => withChange(shared, change), { notes, known });
  store.set({ ...next, editing: null, saveError: null });
  return changes;
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
