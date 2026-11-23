# Specialize

WoW: Hantō stops being a general profession window and covers one fixed set of professions. Data, tests and UI for anything else are removed, not hidden.

## Constraints (C1 to C8, from the owner)

1. The professions are always, in this order: Alchemy, Herbalism, Cooking, Fishing, First Aid. The first two (primary) look distinct from the other three (secondary).
2. No data is gathered, tested or kept for other professions.
3. No profession picker, and no UI to choose professions.
4. Alchemy, Cooking and First Aid recipes show their in-game description just above the notes.
5. Search also matches a gatherable's "Found in" zones: "Mulgore" lists Peacebloom. This applies to herbs and to fish (C7).
6. No recipe learnable above skill 300 appears: the game doesn't support it yet.
7. Fish show the zones they are caught in, as herbs show theirs ("Found in"). Deviate Fish: The Barrens.
8. An easy, documented path to update the data.

## Decisions

- **Description (C4).** The "Use:" line of the item the recipe creates, for example "Restores 70 to 90 health over 21 sec.", built from the `Spell` table's `Description_lang` with its `$` tokens resolved (`$s1`, `$o1`, `$d`, `$t1`, `$/n;s1`, cross-spell references). Item flavour text is not shown. A token the resolver doesn't know fails the build.
- **Learnable level (C6).** The client tables only hold it for item-taught recipes (`ItemSparse.RequiredSkillRank` of the recipe item, never above 300 today). Trainer recipes all read 1 there, so their level comes from a server database (below). Recipes learnable above 300 are dropped; this removes none today and guards later builds. A recipe with no known level is kept, shown without one, and listed in the build report.
- **List and detail (C6).** The list row shows the learnable level beside the name (it showed the yellow level) and sorts by it. The detail subtitle reads `learn X · yellow Y, grey Z`.
- **Server data (C6, C7).** Fishing loot per zone and trainer skill requirements live on the server, not in the client. They come from an open Classic server database (CMaNGOS or VMaNGOS, GPL), the way QuestieDB is used: read at build time, cached in `.cache/`, reduced to facts (zone names per fish, a skill level per recipe). No files, code or rows are copied into this public-domain repo. Forever-only changes are not covered by either; the build reports what is missing. If no usable source is found, fish zones fall back to a hand-written table checked against `AreaTable` names.
- **Saved data.** `hanto:v1` keeps its version. The old `chosen` field is ignored, and notes and known flags of the five professions survive. Bumping the version would wipe every user's notes.
- **Primary and secondary (C1).** A gap after the second tab, and a gold rim on the two primary tabs (desktop side tabs and the mobile strip).
- **Camping recipes.** Herbalism and Fishing keep their Forever "Camping" recipes (Greenhouse, Fishing Hut...).

## Stages

One PR (`cl-specialize`). Each stage ends with `npm run check`, a push, and a pause for review on the PR preview.

| # | Stage | Agent | Model / effort |
|---|---|---|---|
| 1 | Data cut-down (C1, C2) | Dwarf Artificer: Data specialize | Sonnet 5.5 / medium |
| 2 | Recipe descriptions (C4) | Gnome Alchemist: Data descriptions | Opus 5.5 / medium |
| 3 | Server data: fish zones, learnable levels (C6, C7) | Murloc Ranger: Data server-facts | Opus 5.5 / high |
| 4 | Fixed tabs, no picker (C1, C3) | Main session | Opus 5.5 / high |
| 5 | Zone search, learnable level in the list (C5, C6) | Owl Seer: Search zones | Sonnet 5.5 / low |
| 6 | Update path and docs (C8) | Dwarf Scribe: Docs data-update | Sonnet 5.5 / low |
| 7 | QA and review | Goblin Tinker: Qa screenshots, plus the code-review skill | Sonnet 5.5 / low; review at high |

Stage 1 goes first: it changes the data types. Stages 2, 3 and 4 then touch separate files (2 and 3 in new modules under `scripts/`, not in `build-data.mjs`) and can run in parallel. 5, 6 and 7 follow in order.

### 1. Data cut-down

- `build-data.mjs`: the five professions in C1 order, each with `tier: "primary" | "secondary"`.
- Removed: Cloth (it becomes a plain reagent), the Mining gem and vein rules, the Skinning leathers, Poisons, the other professions' bag-family and subclass checks. Locations for Herbalism only.
- Fishing list completed: Deviate Fish (6522), Raw Winter Squid (13755), Large Raw Mightfish (13893), Raw Plated Armorfish (13890).
- `data-lib.test.mjs`: tests for removed rules go.
- `recipes.json` drops from about 2,236 recipes to 345.

### 2. Recipe descriptions

- Downloads `Spell` and what its tokens need (`SpellMisc`, `SpellDuration`, `SpellEffect` is already there).
- The created item's on-use spell (`ItemXItemEffect`, `ItemEffect` trigger 0), its description resolved, saved as `description` on Alchemy, Cooking and First Aid recipes.
- Unit tests for the token resolver.
- The detail pane shows it between the divider and "Notes:".

### 3. Server data

- Short spike first: confirm the source, its pinned commit, its file layout and that it reads with the existing parsers or a small SQL reader.
- Fish: zone ids from fishing loot, named through `AreaTable`, most likely zone first, into `locations.json` like herbs.
- Learnable level: `learn` on every recipe, from the recipe item or the trainer data; the build drops those above 300.

### 4. Fixed tabs

- Removed: `picker.ts`, the picker arrow, `PROFESSION_GROUPS`, `chosen`, `view: "picker"`, Cloth handling in rows and detail, the mobile strip rebuild on choice change in `main.ts`.
- Tabs in C1 order with the primary/secondary treatment.
- `popup.ts` (about 660 lines) is the riskiest file of the task.

### 5. Search and list

- `buildRows`: a herb or fish matches when one of its zones does. Recipes don't match their reagents' zones.
- The list shows and sorts by `learn`. The detail subtitle shows learn, yellow and grey.
- Test cases in `rows.test.ts`.

### 6. Update path

- `npm run data` stays the single command.
- `docs/DATA.md`: the pins to bump (client build, listfile tag, QuestieDB commit, server database commit), running it, reading the report (errors against expected notes), the diff to expect, committing.
- The script exits non-zero on anything that needs a person: an unknown hand-listed item, an unresolved token, a rule matching nothing.
- `docs/PLAN.md` rewritten for the specialised product.

### 7. QA and review

`npm run check`, desktop and phone screenshots, code review. Fixes as `pcr:` commits.

## Risks

- **Server data coverage.** Classic databases don't know Forever-only fish, zones or trainer changes. Missing facts show as blanks and are listed in the build report.
- **Token resolution.** Some descriptions use rare tokens or formulas; the resolver grows with the build failures.
- **Licensing.** The server databases are GPL. Only derived facts are kept, as with QuestieDB.
