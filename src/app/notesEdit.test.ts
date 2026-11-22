import { describe, expect, it } from "vitest";
import { cancelEdit, editStillValid, noteFromDraft, saveEdit, setKnownDraft, startEdit, withNote } from "./notesEdit";
import { createStore } from "./store";
import { MAX_NOTE_LENGTH, emptySaved, fromSaved } from "./storage";

describe("notes editing", () => {
  it("saves the trimmed draft, within the length limit", () => {
    expect(noteFromDraft("  buy vials \n")).toBe("buy vials");
    expect(noteFromDraft("x".repeat(MAX_NOTE_LENGTH + 5))).toHaveLength(MAX_NOTE_LENGTH);
  });

  it("removes the note when the text is empty", () => {
    const notes = { "item:1": "a", "item:2": "b" };
    expect(withNote(notes, "item:1", "")).toEqual({ "item:2": "b" });
    expect(withNote(notes, "item:3", "c")).toEqual({ ...notes, "item:3": "c" });
    expect(notes).toEqual({ "item:1": "a", "item:2": "b" });
  });

  it("keeps an edit only while its entry is open in the list", () => {
    const base = { ...fromSaved({ ...emptySaved(), chosen: ["alchemy"], active: "alchemy" }), detailOpen: true,
      editing: { key: "item:1", draft: "x" } };
    expect(editStillValid(base, "item:1")).toBe(true);
    expect(editStillValid(base, "item:2")).toBe(false);
    expect(editStillValid(base, null)).toBe(false);
    expect(editStillValid({ ...base, detailOpen: false }, "item:1")).toBe(false);
    expect(editStillValid({ ...base, view: "picker" }, "item:1")).toBe(false);
    expect(editStillValid({ ...base, editing: null }, "item:1")).toBe(false);
  });

  it("applies the known flag with the note on Save, and drops both on Cancel", () => {
    const store = createStore(fromSaved({ ...emptySaved(), chosen: ["alchemy"], active: "alchemy" }));
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
