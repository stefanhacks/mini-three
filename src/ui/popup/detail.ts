import { Container, Rectangle, type Text } from "pixi.js";
import { CLOTH_KEY, type Recipe } from "../../data";
import { PROFESSION_ICONS, gathererOf, itemOf, professionByKey, recipesUsingItem } from "../../data/model";
import { type ArtKit, PALETTE, TEXT_STYLES, createStoneOverlay } from "../art";
import { at, checkbox, itemSlot, label, piece, qualityColor, tinted } from "../widgets";

export type Selection = { kind: "recipe"; recipe: Recipe } | { kind: "item"; itemId: number } | null;

export interface DetailPane {
  view: Container;
  /** Rebuilds the pane. `known` is the selected recipe's flag, ignored for items. */
  show: (selection: Selection, known: boolean) => void;
  /** Where the DOM notes field goes, in this pane's local coordinates (the framed field, inset a little). */
  notesArea: { x: number; y: number; width: number; height: number };
}

const PAD = 18;
const ICON_SIZE = 48;
const SLOT_SIZE = 40;
const REAGENT_ROW = 48;
const NOTES_HEIGHT = 84;
const USED_IN_LINE = 18;
/** Narrowest reagent column; wide panes fit more than two. */
const REAGENT_COLUMN = 160;
const NOTES_GAP = 18;

interface DetailOptions {
  /** Notes in a column on the right, full height, instead of under the content: for short, wide panes. */
  notesBeside?: boolean;
}

/** Shortens a single-line label with an ellipsis until it fits `maxWidth`. */
const fitWidth = (text: Text, maxWidth: number): Text => {
  const full = text.text;
  let length = full.length;
  while (text.width > maxWidth && length > 1) {
    length -= 1;
    text.text = `${full.slice(0, length).trimEnd()}…`;
  }
  return text;
};

/** The right-hand pane: what the selected recipe needs, or where a gatherable is used, plus the notes field. */
export const createDetailPane = (
  kit: ArtKit, width: number, height: number, onSelectItem: (itemId: number) => void,
  onToggleKnown: (recipe: Recipe, known: boolean) => void, options: DetailOptions = {},
): DetailPane => {
  const view = new Container();
  view.addChild(piece(kit, "paneDetail", width, height));
  view.addChild(at(createStoneOverlay(kit, width - 2, height - 2, 0.5), 1, 1));
  let body = new Container();
  view.addChild(body);

  const beside = options.notesBeside === true;
  const paneInner = width - PAD * 2;
  // Width of the content column: everything but the notes when they sit beside it.
  const inner = beside ? Math.round(paneInner * 0.6) : paneInner;
  const notesX = beside ? PAD + inner + NOTES_GAP : PAD;
  const notesWidth = beside ? paneInner - inner - NOTES_GAP : inner;
  const notesHeight = beside ? height - PAD * 2 - 12 : NOTES_HEIGHT;
  const notesTop = beside ? PAD : height - NOTES_HEIGHT - PAD - 18;
  // Where the content above (or beside) the notes has to end.
  const contentBottom = beside ? height - PAD : notesTop;

  const heading = (icon: string | null, quality: number, title: string, titleColor: number, subtitle: string) => {
    body.addChild(at(itemSlot(kit, icon, ICON_SIZE, quality), PAD, PAD));
    const name = label(title, tinted(TEXT_STYLES.itemName, titleColor), PAD + ICON_SIZE + 12, PAD + 2, 0, 0);
    name.style.wordWrap = true;
    name.style.wordWrapWidth = inner - ICON_SIZE - 12;
    body.addChild(name);
    const subtitleY = Math.max(PAD + 38, name.y + name.height + 8);
    body.addChild(label(subtitle, TEXT_STYLES.label, PAD + ICON_SIZE + 12, subtitleY));
    body.addChild(at(piece(kit, "divider", inner, 2), PAD, PAD + ICON_SIZE + 18));
  };

  const FIELD_INSET = 6;
  const notesArea = {
    x: notesX + FIELD_INSET, y: notesTop + 12 + FIELD_INSET, width: notesWidth - FIELD_INSET * 2,
    height: notesHeight - FIELD_INSET * 2,
  };

  const notes = () => {
    body.addChild(label("Notes:", TEXT_STYLES.label, notesX, notesTop));
    body.addChild(at(piece(kit, "field", notesWidth, notesHeight), notesX, notesTop + 12));
  };

  const clickable = (target: Container, itemId: number, hitWidth: number, hitHeight: number) => {
    target.eventMode = "static";
    target.cursor = "pointer";
    target.hitArea = new Rectangle(0, 0, hitWidth, hitHeight);
    target.on("pointertap", () => onSelectItem(itemId));
  };

  const showRecipe = (recipe: Recipe, known: boolean) => {
    const profession = professionByKey.get(recipe.profession);
    const created = recipe.item ? itemOf(recipe.item) : null;
    // Most recipes are learnable at skill 1; the yellow and grey thresholds say when it is worth crafting.
    const subtitle = [
      `${profession?.name ?? ""}${recipe.minSkill > 1 ? ` ${recipe.minSkill}` : ""}`,
      recipe.trivialLow > 0 ? `yellow ${recipe.trivialLow}, grey ${recipe.trivialHigh}` : "",
      recipe.count && recipe.count > 1 ? `creates ${recipe.count}` : "",
    ].filter(Boolean).join("  ·  ");
    heading(created?.icon ?? PROFESSION_ICONS[recipe.profession], created?.quality ?? 1, recipe.name,
      created ? qualityColor(created.quality) : PALETTE.text.header, subtitle);

    const top = PAD + ICON_SIZE + 36;
    body.addChild(label("Reagents:", TEXT_STYLES.label, PAD, top));
    const knownBox = checkbox(kit, "Known", TEXT_STYLES.row, (checked) => onToggleKnown(recipe, checked), known);
    body.addChild(at(knownBox.view, PAD + inner - 72, top - 10));
    const columns = Math.max(2, Math.floor(inner / REAGENT_COLUMN));
    const column = Math.floor(inner / columns);
    recipe.reagents.forEach(({ item: itemId, count }, i) => {
      const item = itemOf(itemId);
      const cell = at(new Container(), PAD + (i % columns) * column,
        top + 14 + Math.floor(i / columns) * REAGENT_ROW);
      cell.addChild(itemSlot(kit, item.icon, SLOT_SIZE, item.quality, count));
      const name = label(item.name, tinted(TEXT_STYLES.body, qualityColor(item.quality)), SLOT_SIZE + 8,
        SLOT_SIZE / 2, 0, 0.5);
      name.style.wordWrapWidth = column - SLOT_SIZE - 14;
      cell.addChild(name);
      clickable(cell, itemId, column - 6, SLOT_SIZE);
      body.addChild(cell);
    });
  };

  const showItem = (itemId: number) => {
    const item = itemOf(itemId);
    const gatherer = gathererOf(itemId);
    const subtitle = !gatherer ? "Reagent" : gatherer.key === CLOTH_KEY ? "Cloth" : `Gathered with ${gatherer.name}`;
    heading(item.icon, item.quality, item.name, qualityColor(item.quality), subtitle);

    const users = (recipesUsingItem.get(itemId) ?? []).slice()
      .sort((a, b) => a.profession.localeCompare(b.profession) || a.trivialLow - b.trivialLow);
    const top = PAD + ICON_SIZE + 36;
    body.addChild(label(`Used in ${users.length} recipe${users.length === 1 ? "" : "s"}:`, TEXT_STYLES.label,
      PAD, top));
    const fits = Math.max(1, Math.floor((contentBottom - top - 24) / USED_IN_LINE));
    const shown = users.length > fits ? fits - 1 : users.length;
    users.slice(0, shown).forEach((recipe, i) => {
      const count = recipe.reagents.find((r) => r.item === itemId)?.count ?? 1;
      const profession = professionByKey.get(recipe.profession)?.name ?? "";
      const line = label(`${profession}: ${recipe.name}${count > 1 ? ` (×${count})` : ""}`, TEXT_STYLES.row,
        PAD + 4, top + 22 + i * USED_IN_LINE);
      body.addChild(fitWidth(line, inner - 4));
    });
    if (shown < users.length) {
      body.addChild(label(`…and ${users.length - shown} more`, TEXT_STYLES.muted, PAD + 4,
        top + 22 + shown * USED_IN_LINE));
    }
  };

  return {
    view,
    notesArea,
    show: (selection, known) => {
      body.destroy({ children: true });
      body = new Container();
      view.addChild(body);
      if (!selection) {
        body.addChild(label("Select a recipe or a gatherable.", TEXT_STYLES.muted, width / 2, height / 2, 0.5));
        return;
      }
      if (selection.kind === "recipe") {
        showRecipe(selection.recipe, known);
      } else {
        showItem(selection.itemId);
      }
      notes();
    },
  };
};
