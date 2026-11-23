import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { readEntries } from "../../src/app/entries";
import { type EntriesStore, handleNotes } from "../../src/server/notesApi";

// The shared entries are one JSON document. Site-wide stores are shared by every deploy, so only production uses the
// real one: previews and branch deploys get their own, and never touch the owner's notes.
const KEY = "entries";

const storeFor = (context: Context): EntriesStore => {
  const blobs = getStore({
    name: context.deploy.context === "production" ? "owner-notes" : "owner-notes-preview",
    // Strong reads: the default (eventual) shows stale notes for up to 60 s after a save.
    consistency: "strong",
  });
  return {
    read: async() => {
      const stored = await blobs.getWithMetadata(KEY, { type: "json" });
      return stored === null ? { entries: { notes: {}, known: [] }, version: null }
        : { entries: readEntries(stored.data), version: stored.etag ?? null };
    },
    write: async(entries, version) => {
      const result = await blobs.setJSON(KEY, entries,
        version === null ? { onlyIfNew: true } : { onlyIfMatch: version });
      return result.modified ? result.etag ?? "" : null;
    },
  };
};

export default async(req: Request, context: Context): Promise<Response> =>
  handleNotes(req, storeFor(context), Netlify.env.get("NOTES_EDIT_KEY"));

export const config: Config = {
  path: ["/api/notes", "/api/session"],
  // Per visitor: page loads and saves stay far below this; guessing keys does not.
  rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ["ip", "domain"] },
};
