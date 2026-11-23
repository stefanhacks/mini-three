import { describe, expect, it } from "vitest";
import type { SharedEntries } from "./entries";
import { setDraft, setKnownDraft, startEdit } from "./notesEdit";
import { type KeyStorage, createOwner } from "./owner";
import { type EntriesStore, handleNotes } from "../server/notesApi";
import { emptySaved, fromSaved } from "./storage";
import { createStore } from "./store";

const KEY = "the owner's key";

/**
 * The real notes API over an in-memory document. `down` makes every request fail like a dropped connection; `key`
 * is the edit key the server holds.
 */
const server = (initial: SharedEntries = { notes: {}, known: [] }) => {
  let entries = initial;
  let version = 1;
  const state = { down: false, key: KEY };
  const store: EntriesStore = {
    read: () => Promise.resolve({ entries, version: `v${version}` }),
    write: (next, expected) => {
      if (expected !== `v${version}`) {
        return Promise.resolve(null);
      }
      entries = next;
      version += 1;
      return Promise.resolve(`v${version}`);
    },
  };
  const fetchJson = ((url: string, init?: RequestInit) => {
    return state.down ? Promise.reject(new TypeError("offline"))
      : handleNotes(new Request(`https://zus-hanto.netlify.app${url}`, init), store, state.key);
  }) as typeof fetch;
  return { fetchJson, state, entries: () => entries };
};

const memoryKeys = (initial: string | null = null): KeyStorage & { value: () => string | null } => {
  let value = initial;
  return { get: () => value, set: (key) => { value = key; }, value: () => value };
};

const setup = (initial?: SharedEntries, savedKey: string | null = null) => {
  const remote = server(initial);
  const keys = memoryKeys(savedKey);
  const store = createStore({
    ...fromSaved(emptySaved()), detailOpen: true, shared: "ready",
    notes: initial?.notes ?? {}, known: new Set(initial?.known ?? []),
  });
  const owner = createOwner(store, remote.fetchJson, keys);
  return { remote, keys, store, owner };
};

/** Edits `key` to `text` (and Known, for a recipe) and saves, waiting until the server has answered. */
const edit = async(store: ReturnType<typeof setup>["store"], owner: ReturnType<typeof setup>["owner"], key: string,
  text: string, known?: boolean) => {
  startEdit(store, key, known !== undefined);
  setDraft(store, key, text);
  if (known !== undefined) {
    setKnownDraft(store, known);
  }
  await owner.save();
};

describe("owner session", () => {
  it("logs in only with the edit key, and keeps only a key that worked", async() => {
    const { store, owner, keys } = setup();
    expect(await owner.login("guess")).toBe("wrong");
    expect(store.get().canEdit).toBe(false);
    expect(keys.value()).toBeNull();
    expect(await owner.login(KEY)).toBe("ok");
    expect(store.get().canEdit).toBe(true);
    expect(keys.value()).toBe(KEY);
    owner.logout();
    expect(store.get().canEdit).toBe(false);
    expect(keys.value()).toBeNull();
  });

  it("says when the server can't be reached, and keeps the key it couldn't check", async() => {
    const fresh = setup();
    fresh.remote.state.down = true;
    expect(await fresh.owner.login(KEY)).toBe("unreachable");
    const kept = setup(undefined, KEY);
    kept.remote.state.down = true;
    await kept.owner.restore();
    expect(kept.store.get().canEdit).toBe(false);
    expect(kept.keys.value()).toBe(KEY);
  });

  it("restores a kept key the server still takes, and drops one it refuses", async() => {
    const good = setup(undefined, KEY);
    await good.owner.restore();
    expect(good.store.get().canEdit).toBe(true);
    const stale = setup(undefined, "an old key");
    await stale.owner.restore();
    expect(stale.store.get().canEdit).toBe(false);
    expect(stale.keys.value()).toBeNull();
  });

  it("sends a note and a Known flag, and shows what the server holds afterwards", async() => {
    const { store, owner, remote } = setup({ notes: { "item:9": "from another device" }, known: [] });
    await owner.login(KEY);
    await edit(store, owner, "alchemy:7", "buy vials", true);
    expect(remote.entries()).toEqual({
      notes: { "item:9": "from another device", "alchemy:7": "buy vials" }, known: ["alchemy:7"],
    });
    expect(store.get().notes).toEqual(remote.entries().notes);
    expect(store.get().saveError).toBeNull();
  });

  it("undoes a save the server never got, with a message, and stays logged in", async() => {
    const { store, owner, remote } = setup({ notes: { "item:1": "old" }, known: [] });
    await owner.login(KEY);
    remote.state.down = true;
    await edit(store, owner, "item:1", "new");
    expect(store.get().notes).toEqual({ "item:1": "old" });
    expect(store.get().saveError).toEqual({ key: "item:1", message: "Not saved: the server couldn't be reached." });
    expect(store.get().canEdit).toBe(true);
  });

  it("logs out when the key stops working, undoing the save", async() => {
    const { store, owner, remote, keys } = setup();
    await owner.login(KEY);
    remote.state.key = "a new key";
    await edit(store, owner, "alchemy:7", "", true);
    expect(keys.value()).toBeNull();
    expect(store.get().known.has("alchemy:7")).toBe(false);
    expect(store.get().canEdit).toBe(false);
    expect(store.get().saveError?.message).toMatch(/key no longer works/);
  });
});
