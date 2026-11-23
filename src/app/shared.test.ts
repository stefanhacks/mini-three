import { describe, expect, it } from "vitest";
import { loadShared } from "./shared";
import { emptySaved, fromSaved } from "./storage";
import { createStore } from "./store";

const answering = (respond: () => Response | Promise<Response>): typeof fetch => () => Promise.resolve(respond());

describe("loadShared", () => {
  it("fills notes and Known flags from the server, dropping entries the app would reject", async() => {
    const store = createStore(fromSaved(emptySaved()));
    await loadShared(store, answering(() => Response.json({
      notes: { "alchemy:7": "buy vials", "item:x": "bad" }, known: ["alchemy:7", "item:2"], version: "v1",
    })));
    expect(store.get().shared).toBe("ready");
    expect(store.get().notes).toEqual({ "alchemy:7": "buy vials" });
    expect([...store.get().known]).toEqual(["alchemy:7"]);
  });

  it.each([
    ["an error status", answering(() => new Response("nope", { status: 500 }))],
    ["a body that isn't JSON", answering(() => new Response("<html>"))],
    ["no network", () => Promise.reject(new TypeError("offline"))],
  ])("marks them failed on %s, keeping none", async(_name, fetchJson: typeof fetch) => {
    const store = createStore(fromSaved(emptySaved()));
    await loadShared(store, fetchJson);
    expect(store.get().shared).toBe("failed");
    expect(store.get().notes).toEqual({});
  });
});
