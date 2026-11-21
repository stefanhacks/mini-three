# WoW: Hantō: Plan

WoW: Hantō is a browser look-alike of the World of Warcraft: Forever profession window. It shows a character's known recipes and the reagents their gathering professions collect, and lets the user attach notes to each entry. It is inspired by the in-game window, not a 1:1 copy, and every piece of UI art is our own.

## MVP

- **Profession picker.** The user toggles the professions they want, for example Herbalism and Alchemy. Only those appear in the popup, as side tabs. The choice is saved and can be changed at any time.
- **Each profession tab lists what that profession has:**
  - **Recipes**, grouped by the game's recipe category. Crafting and secondary professions have them, and so do the gathering professions that craft (Mining's smelting, for example).
  - **Gatherables**, listed under the profession that collects them: herbs under Herbalism, ores and stones under Mining, leathers and hides under Skinning, fish under Fishing.
  - **Cloth**, which no profession gathers. It is listed under each profession that uses it, such as Tailoring and First Aid.
  - A profession with both recipes and gatherables, such as Mining, shows both sections.
- There are no separate Recipes or Gatherables tabs. Profession tabs are the only tabs.
- Selecting an entry highlights it and fills the right pane:
  - For a recipe: its reagents and quantities.
  - For a gatherable: its details and the recipes that use it.
  - For both: a notes field (which can hold where to find it, for example).
- A "known" toggle on each recipe, and a filter to show only known recipes. There is no character lookup.
- Notes and known flags are saved in `localStorage`: one browser, one device.
- A blurred background behind the popup, with a few selectable variants.
- Desktop shows the list and the detail pane side by side. Mobile shows the list full screen, and the detail pane slides in over it, with a back control.

## Decisions

- **Data.** Generated from the Forever client's DB2 tables, exported by [wago.tools](https://wago.tools) for product `wowf`. The build is pinned in the script, so the output is reproducible. A Node script with no dependencies writes compact JSON into `src/data/`, and that JSON is committed: Netlify builds never hit wago.tools.
- **Gatherables.** These are reagents that no recipe creates. Each is assigned to the profession that collects it, using `Item.ClassID = 7` (Trade Goods) and its `SubclassID`: 9 herb goes to Herbalism, 7 metal and stone to Mining, and 6 leather to Skinning. Fish share subclass 8 with meat, so stage 1 has to find another way to tell them apart. Cloth (subclass 5) goes under every profession whose recipes use it. Other reagents that drop from creatures show only in recipe details. The script checks these classes against the live data.
- **Profession picker.** The 13 profession lines from the game data are shown as toggles. With nothing chosen yet, the popup opens on the picker.
- **Icons.** `Item.IconFileDataID` is mapped to an icon name through the community listfile (wowdev/wow-listfile on GitHub). The browser then loads the image from `wow.zamimg.com`, which sends `Access-Control-Allow-Origin: *`, so the images can be WebGL textures. If an icon fails to load, the slot keeps an empty frame tinted by the item's quality colour.
- **UI art.** Drawn with Pixi `Graphics`, turned into textures once at startup, and used through `NineSliceSprite`. There are no image files and no Blizzard art.
- **Background.** Our own procedural scenes (gradients, shapes and noise), rendered once and run through `BlurFilter`.
- **Font.** Marcellus (SIL Open Font License), self-hosted as woff2, as a free stand-in for Friz Quadrata. A side-by-side check comes in stage 2 before we commit to it.
- **Text input.** A DOM `<textarea>` placed over the canvas. It gives native typing, IME, mobile keyboards and accessibility.
- **Dependencies.** None added at runtime. Animation uses Pixi's ticker, scrolling is custom, and the CSV parsing is hand-written.

## Stages

Each stage ends with `npm run check`, a push, and a pause for review on the PR preview.

| # | Stage | Output | Agent | Model / effort |
|---|---|---|---|---|
| 1 | Data pipeline | `scripts/build-data.mjs`, `src/data/*.json` (recipes and gatherables per profession), typed loaders | Dwarf Artificer: Data pipeline | Sonnet 5.5 / medium |
| 2 | Art kit | 9-slice texture factory, palette, font, background variants, a static showcase | Elf Enchanter: Ui textures | Opus 5.5 / high |
| 3 | Desktop popup | Frame, profession picker, side tabs for the chosen professions, scrolling grouped list, selection, detail pane, icon loading | Main session | Opus 5.5 / high |
| 4 | State and notes | Saved profession choice, known toggles, known-only filter, notes textarea, versioned `localStorage` | Gnome Scribe: Storage notes | Sonnet 5.5 / medium |
| 5 | Mobile | Layout breakpoint, slide-in detail pane, back control, touch scrolling with inertia, keyboard-safe notes | Owl Ranger: Mobile slide-in | Opus 5.5 / medium |
| 6 | QA and review | Phone and desktop screenshots, perf pass, code review fixes | Goblin Tinker: Qa screenshots, plus the code-review skill | Sonnet 5.5 / low; review at high |

Stages 1 and 2 don't depend on each other and run in parallel. Stages 3 to 6 run in order, because they touch the same files.

Testing stays light. It covers what can actually break: the data extraction and classification, and saving and loading state. UI is checked with screenshots, not unit tests.

## Risks

- **Icon names.** The listfile may not cover every Forever-only icon. Those slots fall back to the empty frame.
- **Hotlinked icons.** If zamimg blocks hotlinking, icons disappear but the app keeps working. Bundling icons is the fallback, which would mean shipping Blizzard art.
- **Licensing.** Recipe and item data are game facts from the client. The project stays non-commercial, in line with Blizzard's fan content terms.
- **Mobile text input.** The on-screen keyboard resizes the viewport differently on iOS and Android. Stage 5 handles it through `visualViewport`.
