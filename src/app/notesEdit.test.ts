import { describe, expect, it } from "vitest";
import { MAX_NOTE_LENGTH, noteFromDraft } from "./entries";
import { cancelEdit, editStillValid, saveEdit, setDraft, setKnownDraft, startEdit } from "./notesEdit";
import { createStore } from "./store";
import { emptySaved, fromSaved } from "./storage";

describe("notes editing", () => {
  it("saves the trimmed draft, within the length limit", () => {
    expect(noteFromDraft("  buy vials \n")).toBe("buy vials");
    expect(noteFromDraft("x".repeat(MAX_NOTE_LENGTH + 5))).toHaveLength(MAX_NOTE_LENGTH);
  });

  it("saves only what changed, each with the change that undoes it", () => {
    const store = createStore({ ...fromSaved(emptySaved()), canEdit: true, notes: { "alchemy:7": "old" } });
    startEdit(store, "alchemy:7", true);
    setDraft(store, "alchemy:7", " old ");
    expect(saveEdit(store)).toEqual([]);
    startEdit(store, "alchemy:7", true);
    setDraft(store, "alchemy:7", "");
    setKnownDraft(store, true);
    expect(saveEdit(store)).toEqual([
      { change: { key: "alchemy:7", note: "" }, undo: { key: "alchemy:7", note: "old" } },
      { change: { key: "alchemy:7", known: true }, undo: { key: "alchemy:7", known: false } },
    ]);
    expect(store.get().notes).toEqual({});
    expect([...store.get().known]).toEqual(["alchemy:7"]);
  });

  it("keeps an edit only while its entry is open in the list", () => {
    const base = { ...fromSaved(emptySaved()), detailOpen: true, canEdit: true,
      editing: { key: "item:1", draft: "x" } };
    expect(editStillValid(base, "item:1")).toBe(true);
    expect(editStillValid(base, "item:2")).toBe(false);
    expect(editStillValid(base, null)).toBe(false);
    expect(editStillValid({ ...base, detailOpen: false }, "item:1")).toBe(false);
    expect(editStillValid({ ...base, editing: null }, "item:1")).toBe(false);
    expect(editStillValid({ ...base, canEdit: false }, "item:1")).toBe(false);
  });

  it("starts no edit unless the owner is logged in", () => {
    const store = createStore(fromSaved(emptySaved()));
    startEdit(store, "item:1", false);
    expect(store.get().editing).toBeNull();
  });

  it("applies the known flag with the note on Save, and drops both on Cancel", () => {
    const store = createStore({ ...fromSaved(emptySaved()), canEdit: true });
    startEdit(store, "alchemy:7837", true);
    setKnownDraft(store, true);
    expect(store.get().known.has("alchemy:7837")).toBe(false);
    cancelEdit(store);
    expect(store.get().known.has("alchemy:7837")).toBe(false);
    startEdit(store, "alchemy:7837", true);
    setKnownDraft(store, true);
    saveEdit(store);
    expect(store.get().known.has("alchemy:7837")).toBe(true);
    expect(store.get().editing).toBeNull();
  });
});
