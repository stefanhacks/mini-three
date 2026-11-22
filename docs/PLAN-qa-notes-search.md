# QA: Inline Notes and Search

PRs #2 (inline notes, known locations) and #3 (search, picker arrow, phone margins) were merged without their QA and review stage. This branch runs that stage on `main` as it is after #3, and holds any fixes.

| Step | Who | Model / effort |
|---|---|---|
| End-to-end pass on desktop and phones: notes (Edit, Save, Cancel, Known in edit mode, cancel on leave), Found in, search (open, match, no matches, close, tab switch), picker arrow, phone margins, plus a perf and leak check | Goblin Tinker: Qa screenshots | Sonnet 5.5 / low |
| Code review of everything since #1 (`7a7ab7f..808a322`) | code-review skill | high |

Fixes go in as `pcr:` commits. No rollback of the merged PRs.

## Sideways phones

Real-phone testing showed a sideways phone has only about 260 to 360 px of height, too little for the frame (the picker lost its toggles). A scaled-down desktop window would be about 0.45x, with unreadable text. Phones held sideways and shorter than 480 px (touch screens only) now show a "Turn your phone upright" notice over the app. Laptops, desktop browsers and tablets are not affected.
