import {
  Container, type FederatedPointerEvent, type FederatedWheelEvent, Graphics, Rectangle, type Text, type Ticker,
} from "pixi.js";
import { CLOTH_KEY, type Recipe } from "../../data";
import {
  PROFESSION_ICONS, gathererOf, itemOf, professionByKey, recipeKey, recipesUsingItem,
} from "../../data/model";
import { type ArtKit, PALETTE, TEXT_STYLES, createStoneOverlay } from "../art";
import { at, button, checkbox, itemSlot, label, piece, qualityColor, tinted } from "../widgets";
import { createDragScroll } from "./dragScroll";

export type Selection = { kind: "recipe"; recipe: Recipe } | { kind: "item"; itemId: number } | null;

/** A rectangle in the detail pane's local coordinates. */
export interface PaneBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetailPane {
  view: Container;
  /**
   * Rebuilds the pane. `known` is the selected recipe's flag (ignored for items), `note` the entry's saved note.
   * The scroll offset is kept when the same entry is shown again (a known toggle), and reset for a new one.
   */
  show: (selection: Selection, known: boolean, note: string) => void;
  /** Where the note text sits right now, in pane coordinates (after scrolling), or null with no selection. */
  noteBox: () => PaneBox | null;
}

interface DetailHandlers {
  onSelectItem: (itemId: number) => void;
  onToggleKnown: (recipe: Recipe, known: boolean) => void;
  /** The Edit button beside the "Notes" label. */
  onEditNote: () => void;
}

const PAD = 18;
const ICON_SIZE = 48;
const SLOT_SIZE = 40;
const REAGENT_ROW = 48;
const USED_IN_LINE = 18;
/** Narrowest reagent column; wide panes fit more than two. */
const REAGENT_COLUMN = 160;
const SECTION_GAP = 18;
const NOTE_LABEL_GAP = 20;
const EDIT_WIDTH = 64;
const EDIT_HEIGHT = 22;
/** Room the Known checkbox takes at the heading's top right. */
const KNOWN_WIDTH = 80;
/** The note block never shrinks below this, so the textarea that replaces it while editing has room. */
export const NOTE_MIN_HEIGHT = 40;
const WHEEL_LINE = 20;

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

const selectionKey = (selection: Selection): string | null => !selection ? null
  : selection.kind === "recipe" ? recipeKey(selection.recipe) : `item:${selection.itemId}`;

/**
 * The right-hand pane, top to bottom: heading (icon, name, subtitle, and Known for recipes), divider, the note as
 * plain text with an Edit button, then the recipe's reagents or the item's "Used in" list. Content taller than the
 * pane scrolls (drag, fling, wheel).
 */
export const createDetailPane = (
  kit: ArtKit, width: number, height: number, ticker: Ticker, handlers: DetailHandlers,
): DetailPane => {
  const view = new Container();
  view.addChild(piece(kit, "paneDetail", width, height));
  view.addChild(at(createStoneOverlay(kit, width - 2, height - 2, 0.5), 1, 1));

  const inner = width - PAD * 2;
  const content = new Container();
  const mask = new Graphics().rect(2, 2, width - 4, height - 4).fill(0xffffff);
  content.mask = mask;
  view.addChild(content, mask);
  let body = new Container();
  content.addChild(body);

  let scroll = 0;
  let contentHeight = 0;
  let note: PaneBox | null = null;
  let shownKey: string | null = null;
  const maxScroll = () => Math.max(0, contentHeight - height);
  const scrollTo = (value: number) => {
    scroll = Math.min(Math.max(0, value), maxScroll());
    content.y = -Math.round(scroll);
  };

  const drag = createDragScroll(view, ticker, { get: () => scroll, set: scrollTo }, content);
  const area = new Container();
  area.hitArea = new Rectangle(0, 0, width, height);
  area.eventMode = "static";
  view.addChildAt(area, 2);
  area.on("pointerdown", (event: FederatedPointerEvent) => drag.press(event));
  content.eventMode = "static";
  content.on("pointerdown", (event: FederatedPointerEvent) => drag.press(event));
  view.eventMode = "static";
  view.on("wheel", (event: FederatedWheelEvent) => {
    drag.stop();
    scrollTo(scroll + (event.deltaMode === 1 ? event.deltaY * WHEEL_LINE : event.deltaY));
  });

  /** Heading and divider; returns the y under the divider. `reserveRight` keeps the name clear of Known. */
  const heading = (icon: string | null, quality: number, title: string, titleColor: number, subtitle: string,
    reserveRight: number): number => {
    body.addChild(at(itemSlot(kit, icon, ICON_SIZE, quality), PAD, PAD));
    const textX = PAD + ICON_SIZE + 12;
    const name = label(title, tinted(TEXT_STYLES.itemName, titleColor), textX, PAD + 2, 0, 0);
    name.style.wordWrap = true;
    name.style.wordWrapWidth = inner - ICON_SIZE - 12 - reserveRight;
    body.addChild(name);
    const subtitleY = Math.max(PAD + 38, name.y + name.height + 8);
    const sub = label(subtitle, TEXT_STYLES.label, textX, subtitleY);
    body.addChild(fitWidth(sub, inner - ICON_SIZE - 12));
    const dividerY = Math.max(PAD + ICON_SIZE + 18, subtitleY + 16);
    body.addChild(at(piece(kit, "divider", inner, 2), PAD, dividerY));
    return dividerY + 2;
  };

  /** "Notes" label with the Edit button, then the note as wrapped text. Returns the y under the block. */
  const noteBlock = (top: number, text: string): number => {
    const labelY = top + 14;
    body.addChild(label("Notes:", TEXT_STYLES.label, PAD, labelY));
    const edit = button(kit, "Edit", EDIT_WIDTH, handlers.onEditNote, EDIT_HEIGHT);
    body.addChild(at(edit.view, PAD + inner - EDIT_WIDTH, labelY - EDIT_HEIGHT / 2));
    const textY = labelY + NOTE_LABEL_GAP - 6;
    const shown = text.trim() === ""
      ? label("No notes yet.", TEXT_STYLES.muted, PAD, textY, 0, 0)
      : label(text, TEXT_STYLES.body, PAD, textY, 0, 0);
    // User text: wrap at the pane width and break words longer than a line (URLs, coordinates).
    shown.style = shown.style.clone();
    shown.style.wordWrap = true;
    shown.style.breakWords = true;
    shown.style.wordWrapWidth = inner;
    body.addChild(shown);
    const blockHeight = Math.max(NOTE_MIN_HEIGHT, shown.height);
    note = { x: PAD, y: textY, width: inner, height: blockHeight };
    return textY + blockHeight;
  };

  const clickable = (target: Container, itemId: number, hitWidth: number, hitHeight: number) => {
    target.eventMode = "static";
    target.cursor = "pointer";
    target.hitArea = new Rectangle(0, 0, hitWidth, hitHeight);
    target.on("pointertap", () => {
      if (!drag.dragged()) {
        handlers.onSelectItem(itemId);
      }
    });
  };

  const showRecipe = (recipe: Recipe, known: boolean, text: string): number => {
    const profession = professionByKey.get(recipe.profession);
    const created = recipe.item ? itemOf(recipe.item) : null;
    // Most recipes are learnable at skill 1; the yellow and grey thresholds say when it is worth crafting.
    const subtitle = [
      `${profession?.name ?? ""}${recipe.minSkill > 1 ? ` ${recipe.minSkill}` : ""}`,
      recipe.trivialLow > 0 ? `yellow ${recipe.trivialLow}, grey ${recipe.trivialHigh}` : "",
      recipe.count && recipe.count > 1 ? `creates ${recipe.count}` : "",
    ].filter(Boolean).join("  ·  ");
    const underDivider = heading(created?.icon ?? PROFESSION_ICONS[recipe.profession], created?.quality ?? 1,
      recipe.name, created ? qualityColor(created.quality) : PALETTE.text.header, subtitle, KNOWN_WIDTH);
    // Known sits at the heading's top right, where the game shows its favourite star.
    const knownBox = checkbox(kit, "Known", TEXT_STYLES.row,
      (checked) => handlers.onToggleKnown(recipe, checked), known);
    body.addChild(at(knownBox.view, PAD + inner - 72, PAD + 2));

    const top = noteBlock(underDivider, text) + SECTION_GAP;
    body.addChild(label("Reagents:", TEXT_STYLES.label, PAD, top));
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
    return top + 14 + Math.ceil(recipe.reagents.length / columns) * REAGENT_ROW;
  };

  const showItem = (itemId: number, text: string): number => {
    const item = itemOf(itemId);
    const gatherer = gathererOf(itemId);
    const subtitle = !gatherer ? "Reagent" : gatherer.key === CLOTH_KEY ? "Cloth" : `Gathered with ${gatherer.name}`;
    const underDivider = heading(item.icon, item.quality, item.name, qualityColor(item.quality), subtitle, 0);

    const users = (recipesUsingItem.get(itemId) ?? []).slice()
      .sort((a, b) => a.profession.localeCompare(b.profession) || a.trivialLow - b.trivialLow);
    const top = noteBlock(underDivider, text) + SECTION_GAP;
    body.addChild(label(`Used in ${users.length} recipe${users.length === 1 ? "" : "s"}:`, TEXT_STYLES.label,
      PAD, top));
    // The pane scrolls, so the whole list is shown.
    users.forEach((recipe, i) => {
      const count = recipe.reagents.find((r) => r.item === itemId)?.count ?? 1;
      const profession = professionByKey.get(recipe.profession)?.name ?? "";
      const line = label(`${profession}: ${recipe.name}${count > 1 ? ` (×${count})` : ""}`, TEXT_STYLES.row,
        PAD + 4, top + 22 + i * USED_IN_LINE);
      body.addChild(fitWidth(line, inner - 4));
    });
    return top + 22 + users.length * USED_IN_LINE;
  };

  return {
    view,
    noteBox: () => note && { ...note, y: note.y - scroll },
    show: (selection, known, text) => {
      body.destroy({ children: true });
      body = new Container();
      content.addChild(body);
      note = null;
      const key = selectionKey(selection);
      if (!selection) {
        body.addChild(label("Select a recipe or a gatherable.", TEXT_STYLES.muted, width / 2, height / 2, 0.5));
        contentHeight = 0;
      } else {
        const bottom = selection.kind === "recipe" ? showRecipe(selection.recipe, known, text)
          : showItem(selection.itemId, text);
        contentHeight = bottom + PAD;
      }
      if (key !== shownKey) {
        drag.stop();
        scroll = 0;
      }
      shownKey = key;
      scrollTo(scroll);
    },
  };
};
