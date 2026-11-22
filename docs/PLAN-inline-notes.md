# Inline Notes: Plan

Notes stop being a box at the bottom of the detail pane. They become part of the entry: read-only text right under the heading's divider, editable only after pressing an Edit button.

## Target layout (detail pane, top to bottom)

1. Heading: icon, name, subtitle. The Known checkbox sits at the top right, where the game shows its favourite star.
2. Divider.
3. **Note block**: a "Notes" label with an **Edit** button on the same line, right-aligned. Under them is the note as plain wrapped text, with no field frame. An empty note shows a muted "No notes yet."
4. **Recipe**: the Reagents grid. **Gatherable or reagent**: the "Used in N recipes" list. Either way it moves under the note block.

## Behaviour

- **Edit** swaps the text for the DOM textarea in the same place, at least 84 px tall and growing with the text. **Save** and **Cancel** replace the Edit button while editing.
- **Save** stores the text. **Cancel**, or Escape, restores the saved note. Nothing is written while typing.
- Leaving the entry while editing cancels the edit: another row, a tab, the picker, or Back. *(Open: confirm, or keep the draft instead.)*
- The pane's content scrolls when it is taller than the pane (drag, fling, wheel). This also removes the old "…and N more" cut in "Used in".
- On mobile, the keyboard lift from stage 5 still applies. The textarea stays hidden while the pane slides.
- The note text uses the body font stack, so user text (accents, emoji) renders the same as in the textarea.

## Stages

Each stage ends with `npm run check`, a push, and a pause for review on the PR preview.

| # | Stage | Output | Agent | Model / effort |
|---|---|---|---|---|
| 1 | Read layout | Detail pane rebuilt top to bottom: heading with Known, note block in display mode with an Edit button that does nothing yet, reagents or used-in below, the content scrolling when too tall. Desktop and mobile. | Main session | Opus 5.5 / high |
| 2 | Edit mode | Edit, Save and Cancel, a transient editing state in the store, textarea placement over the note block, the exit rules above, mobile keyboard and slide checks | Kobold Scribe: Notes edit-toggle | Sonnet 5.5 / medium |
| 3 | QA and review | Phone and desktop pass, then a code review with fixes as `pcr:` commits | Goblin Tinker: Qa screenshots, plus the code-review skill | Sonnet 5.5 / low; review at high |

A possible stage 4, "Known locations" (where a gatherable is found), is not planned yet; see the PR discussion.

Stage 1 stays with the main session because it restructures `detail.ts`, which the other stages build on.

Testing stays light: at most one pure function for the block layout, if one falls out of stage 1. Everything else is checked with screenshots.
