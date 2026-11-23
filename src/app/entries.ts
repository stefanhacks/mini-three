import { PROFESSION_KEYS } from "../data/keys";

// The rules for note and Known entries, shared by the app and the notes function, so neither keeps what the other
// would reject. No dataset imports: the function bundles this file.

export const MAX_NOTE_LENGTH = 1000;

const PROFESSIONS: ReadonlySet<string> = new Set(PROFESSION_KEYS);

/** A recipe's key: `<profession>:<spell id>`, for one of the covered professions. */
export const isRecipeKey = (key: string): boolean =>
  /^[a-z-]+:\d+$/.test(key) && PROFESSIONS.has(key.split(":")[0]);

/** A note's key: a recipe's key, or `item:<item id>`. */
export const isNoteKey = (key: string): boolean => isRecipeKey(key) || /^item:\d+$/.test(key);

/** The note text a draft saves as: trimmed, and within the saved length. */
export const noteFromDraft = (draft: string): string => draft.trim().slice(0, MAX_NOTE_LENGTH);

/** The notes and Known flags everyone sees. */
export interface SharedEntries {
  /** Notes by recipe or item key. Empty notes are not kept. */
  notes: Record<string, string>;
  /** Recipe keys marked as known. */
  known: string[];
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The strings of an array, or none when it isn't one. */
export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/** Notes from untrusted data: bad keys, non-strings and empty texts dropped, long texts cut. */
export const readNotes = (value: unknown): Record<string, string> => isRecord(value)
  ? Object.fromEntries(Object.entries(value).flatMap(([key, text]): [string, string][] =>
    isNoteKey(key) && typeof text === "string" && text !== "" ? [[key, text.slice(0, MAX_NOTE_LENGTH)]] : []))
  : {};

/** Known flags from untrusted data: recipe keys only, once each. */
export const readKnown = (value: unknown): string[] => [...new Set(strings(value).filter(isRecipeKey))];

/** Shared entries from untrusted data (a stored document, a response). Never throws. */
export const readEntries = (value: unknown): SharedEntries => ({
  notes: readNotes(isRecord(value) ? value.notes : undefined),
  known: readKnown(isRecord(value) ? value.known : undefined),
});

/** One change a save makes: a note's text ("" removes it) or a recipe's Known flag. */
export type EntryChange = { key: string; note: string } | { key: string; known: boolean };

/** `entries` with `change` applied. */
export const applyChange = (entries: SharedEntries, change: EntryChange): SharedEntries => {
  if ("note" in change) {
    const notes = { ...entries.notes };
    if (change.note === "") {
      delete notes[change.key];
    } else {
      notes[change.key] = change.note;
    }
    return { ...entries, notes };
  }
  const known = entries.known.filter((key) => key !== change.key);
  return { ...entries, known: change.known ? [...known, change.key] : known };
};
