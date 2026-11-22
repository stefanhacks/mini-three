# QA: Inline Notes and Search

PRs #2 (inline notes, known locations) and #3 (search, picker arrow, phone margins) were merged without their QA and review stage. This branch runs that stage on `main` as it is after #3, and holds any fixes.

| Step | Who | Model / effort |
|---|---|---|
| End-to-end pass on desktop and phones: notes (Edit, Save, Cancel, Known in edit mode, cancel on leave), Found in, search (open, match, no matches, close, tab switch), picker arrow, phone margins, plus a perf and leak check | Goblin Tinker: Qa screenshots | Sonnet 5.5 / low |
| Code review of everything since #1 (`7a7ab7f..808a322`) | code-review skill | high |

Fixes go in as `pcr:` commits. No rollback of the merged PRs.
