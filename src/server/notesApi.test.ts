import { describe, expect, it } from "vitest";
import type { SharedEntries } from "../app/entries";
import { type EntriesStore, handleNotes, isEditKey } from "./notesApi";

const KEY = "correct horse battery staple";

/** An in-memory store. Before each of the next `racers` writes, another save lands first and adds its own note. */
const memoryStore = (initial: SharedEntries | null = null, racers = 0) => {
  let stored = initial;
  let version = initial ? 1 : 0;
  let pending = racers;
  const store: EntriesStore = {
    read: () => Promise.resolve({
      entries: stored ?? { notes: {}, known: [] }, version: stored ? `v${version}` : null,
    }),
    write: (entries, expected) => {
      if (pending > 0) {
        pending -= 1;
        version += 1;
        const current = stored ?? { notes: {}, known: [] };
        stored = { ...current, notes: { ...current.notes, [`item:${900 + pending}`]: "theirs" } };
      }
      const current = stored ? `v${version}` : null;
      if (expected !== current) {
        return Promise.resolve(null);
      }
      version += 1;
      stored = entries;
      return Promise.resolve(`v${version}`);
    },
  };
  return { store, entries: () => stored };
};

const request = (method: string, path: string, { body, key }: { body?: unknown; key?: string } = {}) =>
  new Request(`https://zus-hanto.netlify.app${path}`, {
    method,
    headers: key ? { authorization: `Bearer ${key}` } : {},
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

const put = (store: EntriesStore, body: unknown, key: string | undefined = KEY) =>
  handleNotes(request("PUT", "/api/notes", { body, key }), store, KEY);

describe("notes API", () => {
  it("lets anyone read, uncached, and starts empty", async() => {
    const { store } = memoryStore();
    const response = await handleNotes(request("GET", "/api/notes"), store, KEY);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ notes: {}, known: [], version: null });
  });

  it.each([
    ["no key", undefined, KEY],
    ["a wrong key", "wrong", KEY],
    ["a prefix of the key", KEY.slice(0, 10), KEY],
    ["any key while none is configured", KEY, undefined],
  ])("refuses saves with %s", async(_name, given, configured) => {
    const { store, entries } = memoryStore();
    const response = await handleNotes(request("PUT", "/api/notes", { body: { key: "item:1", note: "x" }, key: given }),
      store, configured);
    expect(response.status).toBe(401);
    expect(entries()).toBeNull();
  });

  it("saves, trims and removes notes, and sets and clears Known, one entry at a time", async() => {
    const { store, entries } = memoryStore({ notes: { "item:2": "keep" }, known: ["cooking:5"] });
    expect((await put(store, { key: "alchemy:7", note: "  buy vials \n" })).status).toBe(200);
    expect((await put(store, { key: "alchemy:7", known: true })).status).toBe(200);
    expect((await put(store, { key: "cooking:5", known: false })).status).toBe(200);
    const last = await put(store, { key: "item:2", note: "   " });
    expect(entries()).toEqual({ notes: { "alchemy:7": "buy vials" }, known: ["alchemy:7"] });
    expect(await last.json()).toEqual({ ...entries(), version: "v5" });
  });

  it.each([
    ["not JSON", "{oops"],
    ["a body over 8 KB", JSON.stringify({ key: "item:1", note: "x".repeat(9000) })],
    ["no key", { note: "x" }],
    ["both note and known", { key: "alchemy:7", note: "x", known: true }],
    ["neither", { key: "alchemy:7" }],
    ["an unknown profession", { key: "mining:7", note: "x" }],
    ["Known on an item", { key: "item:1", known: true }],
    ["a non-boolean Known", { key: "alchemy:7", known: "yes" }],
  ])("refuses %s", async(_name, body) => {
    const { store, entries } = memoryStore();
    expect((await put(store, body)).status).toBe(400);
    expect(entries()).toBeNull();
  });

  it("cuts a note to the length the app keeps", async() => {
    const { store, entries } = memoryStore();
    await put(store, { key: "item:1", note: "x".repeat(1500) });
    expect(entries()?.notes["item:1"]).toHaveLength(1000);
  });

  it("retries when another save lands first, keeping both", async() => {
    const { store, entries } = memoryStore({ notes: {}, known: [] }, 2);
    expect((await put(store, { key: "item:1", note: "mine" })).status).toBe(200);
    expect(entries()?.notes).toEqual({ "item:1": "mine", "item:900": "theirs", "item:901": "theirs" });
  });

  it("gives up with 409 when other saves keep landing first", async() => {
    const { store } = memoryStore({ notes: {}, known: [] }, 3);
    expect((await put(store, { key: "item:1", note: "mine" })).status).toBe(409);
  });

  it("checks a key for login, and answers unknown routes and methods", async() => {
    const { store } = memoryStore();
    expect((await handleNotes(request("GET", "/api/session", { key: KEY }), store, KEY)).status).toBe(204);
    expect((await handleNotes(request("GET", "/api/session", { key: "nope" }), store, KEY)).status).toBe(401);
    expect((await handleNotes(request("DELETE", "/api/notes", { key: KEY }), store, KEY)).status).toBe(405);
    expect((await handleNotes(request("GET", "/api/other"), store, KEY)).status).toBe(404);
  });
});

describe("isEditKey", () => {
  it("accepts only the exact key, including one of a different length", async() => {
    expect(await isEditKey(KEY, KEY)).toBe(true);
    expect(await isEditKey(`${KEY} `, KEY)).toBe(false);
    expect(await isEditKey("", KEY)).toBe(false);
  });
});
