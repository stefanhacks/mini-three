import { type SharedEntries, isNoteKey, isRecipeKey, isRecord, noteFromDraft } from "../app/entries";

/**
 * Where the shared entries live. `write` stores `entries` only if the stored version is still `version` (null: none
 * stored yet), and returns the new version, or null when someone else wrote first.
 */
export interface EntriesStore {
  read: () => Promise<{ entries: SharedEntries; version: string | null }>;
  write: (entries: SharedEntries, version: string | null) => Promise<string | null>;
}

/** One change a save makes: a note's text ("" removes it) or a recipe's Known flag. */
export type EntryChange = { key: string; note: string } | { key: string; known: boolean };

/** Attempts at a save when other saves keep landing first. */
const WRITE_ATTEMPTS = 3;
/** Larger request bodies are refused unread: one note and its key fit well within. */
const MAX_BODY = 8192;

const json = (body: unknown, status = 200): Response => Response.json(body, {
  status,
  // Visitors must always see the latest notes, never a cached copy.
  headers: { "cache-control": "no-store" },
});

const error = (status: number, message: string): Response => json({ error: message }, status);

const sha256 = async(text: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

/** Whether `given` is the edit key, compared in constant time (on digests, so lengths don't leak either). */
export const isEditKey = async(given: string | null, editKey: string | undefined): Promise<boolean> => {
  if (!given || !editKey) {
    return false;
  }
  const [a, b] = await Promise.all([sha256(given), sha256(editKey)]);
  let difference = 0;
  a.forEach((byte, i) => {
    difference |= byte ^ b[i];
  });
  return difference === 0;
};

const bearer = (req: Request): string | null => /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1]
  ?? null;

/** The change a request body asks for, or the reason it is refused. */
export const readChange = (body: unknown): EntryChange | string => {
  if (!isRecord(body) || typeof body.key !== "string") {
    return "expected { key, note } or { key, known }";
  }
  const { key } = body;
  if (typeof body.note === "string" && body.known === undefined) {
    return isNoteKey(key) ? { key, note: noteFromDraft(body.note) } : `not a note key: ${key}`;
  }
  if (typeof body.known === "boolean" && body.note === undefined) {
    return isRecipeKey(key) ? { key, known: body.known } : `not a recipe key: ${key}`;
  }
  return "expected exactly one of note (string) or known (boolean)";
};

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

const readBody = async(req: Request): Promise<unknown> => {
  const text = await req.text();
  if (text.length > MAX_BODY) {
    throw new Error("too large");
  }
  return JSON.parse(text) as unknown;
};

const save = async(req: Request, store: EntriesStore): Promise<Response> => {
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return error(400, "the body must be JSON, at most 8 KB");
  }
  const change = readChange(body);
  if (typeof change === "string") {
    return error(400, change);
  }
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const { entries, version } = await store.read();
    const next = applyChange(entries, change);
    const written = await store.write(next, version);
    if (written !== null) {
      return json({ ...next, version: written });
    }
  }
  return error(409, "other saves kept landing first; try again");
};

/**
 * The notes API.
 * - `GET /api/notes`: everyone. The shared notes and Known flags, and their version.
 * - `PUT /api/notes`: the owner only (`Authorization: Bearer <edit key>`). Applies one change, and answers with the
 *   entries after it.
 * - `GET /api/session`: 204 when the request carries the edit key, else 401. The app checks a key with it on login.
 *
 * `editKey` undefined (not configured) refuses every key.
 */
export const handleNotes = async(req: Request, store: EntriesStore, editKey: string | undefined):
  Promise<Response> => {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/session" && req.method === "GET") {
    return await isEditKey(bearer(req), editKey) ? new Response(null, { status: 204 }) : error(401, "not the edit key");
  }
  if (pathname !== "/api/notes") {
    return error(404, "not found");
  }
  if (req.method === "GET") {
    const { entries, version } = await store.read();
    return json({ ...entries, version });
  }
  if (req.method === "PUT") {
    return await isEditKey(bearer(req), editKey) ? save(req, store) : error(401, "not the edit key");
  }
  return error(405, "use GET or PUT");
};
