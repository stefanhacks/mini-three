# Owner edit

Notes and Known flags become the owner's, shared with every visitor and editable only by the owner. Status: **draft, for review. No code until approved.**

## Constraints (C1 to C5, from the owner)

1. By default the app works as it does now, except that recipes and items can't be edited: no note editing, no Known toggle.
2. One way to authenticate, for one user (the owner). Once authenticated, editing works as it does now.
3. Anyone opening the app, from anywhere, sees the owner's notes and Known flags.
4. No new service provider. Netlify (hosting, already used) and common public APIs are fine.
5. Visitors keep no notes of their own.

## Decisions

- **Storage: Netlify Blobs, behind one Netlify Function.** No other provider, and no account.
  - `GET /api/notes`: public. Returns `{ notes, known }` and its version (the blob's ETag).
  - `PUT /api/notes`: owner only. Changes one entry: `{ key, note }` or `{ key, known }`.
  - Reads use strong consistency. The default "eventual" consistency would show visitors stale notes for up to 60 s.
- **One document.** All notes and flags live in one blob, so a page load is one read.
  - Blobs has no merging: the last write wins.
  - Each save sends one entry. The function reads the document, applies the entry, and writes it back only if no one else wrote in between (`onlyIfMatch` on the ETag), retrying a few times.
  - So two of the owner's devices can't overwrite each other's other notes.
  - Netlify's docs point at Netlify DB for read-modify-write data. With a single editor, one Blobs document is enough, and simpler.
- **Authentication: one secret key.**
  - The key lives in the `NOTES_EDIT_KEY` environment variable (scope: Functions). It is never in the repo or the build.
  - The owner pastes it once; the browser keeps it in `localStorage`, and every save sends it as `Authorization: Bearer <key>`.
  - The function compares it in constant time, and returns 401 without it.
  - The save endpoint gets Netlify's built-in function rate limit.
  - A leaked key exposes editing only; the notes are public anyway. To revoke it, change the variable and redeploy.
- **Deploy previews never touch production notes.** Site-wide stores are shared by every deploy, including PR previews.
  - The function picks its store by deploy context: `owner-notes` in production, `owner-notes-preview` everywhere else.
  - `NOTES_EDIT_KEY` gets a different, throwaway value for Deploy Previews, so edits can be tested on a PR without the real key.
- **Validation is shared.** The function and the app use the same checks:
  - key format (`<profession>:<id>` or `item:<id>`);
  - known professions;
  - the 1,000-character note limit;
  - no empty notes stored.

  They move into a pure module that both import. A bad write can't reach visitors.
- **What stays per browser.** The open tab, collapsed sections, Known only and the key stay in `localStorage` (`hanto:v1`). Notes and Known flags move to the server.
- **Saving.**
  - Optimistic: the view updates at once.
  - A failed save reverts the entry and shows a short error in the detail pane.
  - No retry queue, no offline mode.
- **Loading.**
  - Until the notes arrive, the list shows no Known checks and the detail shows "Loading notes…".
  - If they don't arrive, it shows "Notes unavailable" and stays read-only.
- **Login, logout.** A small control to paste the key, and to forget it again. Placement is an open question (below).
- **Your current notes.** On the first login, if the server has no notes and this browser has some, the app uploads them once, then drops the local copy.
  - This only works in the browser and address that holds them. See the domain question below.

## Netlify setup (owner)

- [x] `NOTES_EDIT_KEY`, Production context, Functions scope (done).
- [ ] `NOTES_EDIT_KEY` for the Deploy Previews context: a different, throwaway value, used for testing on the PR preview.
- Nothing else to create. The Blobs stores appear on first write (**Data & Storage → Blobs**); the function appears after the first deploy (**Logs & metrics → Functions**).

## Dependencies

- `@netlify/blobs` (runtime, function only, not shipped to the browser).
- `@netlify/functions` (types, dev only).
- No Netlify CLI. The function's logic is a pure handler that takes the store and the key as arguments, so it is unit-tested with an in-memory store. The real thing is tested on the PR preview.

## Stages

One PR (`cl-owner-edit`). Each stage ends with `npm run check`, a push, and a pause for review on the PR preview. All in the main session.

| # | Stage |
|---|---|
| 1 | Shared validation module; the function (GET, PUT, key check, conflict retry, store by context) and its tests |
| 2 | App reads notes and flags from the server; read-only mode by default (no Edit, Known not clickable) |
| 3 | Login and logout control; saving through the function; error and loading states |
| 4 | One-time upload of local notes; `localStorage` no longer holds notes |
| 5 | QA on the PR preview with the preview key: visitor view, owner view, two tabs editing, failed save, wrong key |

## Open questions

1. **Old domain.**
   - Notes saved before the rename are in browser storage for `mini-three.netlify.app`, which pages on `zus-hanto.netlify.app` can't read.
   - Does the old address still load the app?
     - If yes: stage 4 can import them from there.
     - If no: they are effectively lost, unless you want to retype them, or I add a one-time "paste a backup" import.
2. **Login control placement.** Options:
   - a small lock button in the title strip (both layouts);
   - a link under the Search button;
   - something hidden, like a long press on the portrait.
3. **Read-only Known.** For visitors, show the quiet "Known" tag (as the detail pane does today while not editing), or nothing?
