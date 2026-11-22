# Search: Plan

The Professions button becomes a **Search** button that filters the list by name. Reopening the profession picker moves to a left-pointing arrow placed before the profession tabs.

## Scope (confirmed by the owner)

- **Search**: a text field, a DOM input like the notes textarea, over the list's top strip. It filters the active tab's list, and matches are case- and accent-insensitive.
  - It matches recipe names and gatherable names.
  - A recipe also matches when one of its reagents does.
  - Headers stay for sections that still have matches.
  - Clearing the field or closing search restores the full list.
- **Picker arrow**: a small left-pointing chevron button.
  - **Desktop**: above the first side tab.
  - **Mobile**: at the start of the tab strip.
  - It opens the picker, exactly as the Professions button does today.

## Stages

Each stage ends with `npm run check`, a push, and a pause for review on the PR preview.

| # | Stage | Agent | Model / effort |
|---|---|---|---|
| 1 | Picker arrow and button swap: Professions removed, arrow added, Search button placed (inert). Done. | Main session | Opus 5.5 / medium |
| 2 | Search: input field, filtering in `buildRows`, desktop and mobile, keyboard handling | Elf Seeker: Search filter | Sonnet 5.5 / medium |
| 3 | QA and review | Goblin Tinker: Qa screenshots, plus the code-review skill | Sonnet 5.5 / low; review at high |
