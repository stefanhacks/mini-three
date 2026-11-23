import { Container, Graphics, Rectangle, type Text, type Ticker } from "pixi.js";
import type { AppState } from "../../app/store";
import type { Recipe } from "../../data";
import { itemKey } from "../../data/keys";
import {
  PROFESSION_ICONS, gathererOf, itemOf, locationsOf, professionByKey, recipeKey, recipesUsingItem,
} from "../../data/model";
import { type ArtKit, PALETTE, QUALITY_COLORS, TEXT_STYLES, createStoneOverlay } from "../art";
import {
  at, button, checkbox, iconSprite, itemSlot, label, piece, qualityColor, tappable, tinted, wrapped,
} from "../widgets";
import { attachScrollInput, createDragScroll } from "./dragScroll";

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
   * Rebuilds the pane for `selection`. The scroll offset is kept when the same entry is shown again (a known toggle,
   * a taller textarea), and reset for a new one.
   */
  show: (selection: Selection, view: DetailView) => void;
  /** Where the note text (or the textarea over it) sits right now, in pane coordinates after scrolling, or null. */
  noteBox: () => PaneBox | null;
}

/** What the pane shows of the selected entry, besides the entry itself. */
export interface DetailView {
  /** The selected recipe's Known flag (ignored for items). */
  known: boolean;
  /** The entry's saved note. */
  note: string;
  /** Whether the notes have arrived; until they do, the note area says so. */
  notes: AppState["shared"];
  /** The owner is logged in: the Edit button shows. */
  canEdit: boolean;
  /**
   * Null while reading. While editing, the height reserved for the textarea, which replaces the note text; the pane
   * scrolls to keep that block in view.
   */
  editHeight: number | null;
  /** Why the last save of this entry failed, shown under its note. */
  error: string | null;
}

/** The note area's text when the entry has no note. */
const NO_NOTE: Record<AppState["shared"], string> = {
  loading: "Loading notes…",
  ready: "No notes yet.",
  failed: "Notes unavailable.",
};

interface DetailHandlers {
  onSelectItem: (itemId: number) => void;
  /** The Known checkbox, shown only while editing: it changes the edit's draft, which Save keeps. */
  onToggleKnown: (recipe: Recipe, known: boolean) => void;
  /** The Edit button in the pane's bottom-right corner. */
  onEditNote: () => void;
  /** Save and Cancel replace Edit while editing. */
  onSaveNote: () => void;
  onCancelNote: () => void;
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
/** How far the edit box's frame reaches outside the textarea. */
const FIELD_FRAME = 5;
const EDIT_WIDTH = 64;
const EDIT_HEIGHT = 22;
const EDIT_GAP = 6;
/** Room the Known checkbox takes at the heading's top right. */
const KNOWN_WIDTH = 80;
/** The note block never shrinks below this. */
export const NOTE_MIN_HEIGHT = 40;
/** The textarea is at least this tall while editing. */
export const NOTE_EDIT_MIN_HEIGHT = 84;
/** The tallest the textarea grows in a pane of this height; longer text scrolls inside it. */
export const noteEditMaxHeight = (paneHeight: number): number =>
  Math.max(NOTE_EDIT_MIN_HEIGHT, Math.floor(paneHeight * 0.5));

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

export const selectionKey = (selection: Selection): string | null => !selection ? null
  : selection.kind === "recipe" ? recipeKey(selection.recipe) : itemKey(selection.itemId);

/**
 * The right-hand pane, top to bottom: heading (icon, name, subtitle, and Known for recipes), divider, the note as
 * plain text with an Edit button, then the recipe's source and reagents or the item's "Used in" list. Content
 * taller than the pane scrolls (drag, fling, wheel).
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
  // Edit sits in the pane's bottom-right corner, out of the way and fixed while the content scrolls.
  const edit = button(kit, "Edit", EDIT_WIDTH, handlers.onEditNote, EDIT_HEIGHT);
  view.addChild(at(edit.view, width - PAD / 2 - EDIT_WIDTH, height - PAD / 2 - EDIT_HEIGHT));
  edit.view.visible = false;

  let scroll = 0;
  let contentHeight = 0;
  let note: PaneBox | null = null;
  let shownKey: string | null = null;
  /** The note block as the last build placed it (a call, so the compiler doesn't narrow it to the reset value). */
  const noteBlockBox = (): PaneBox | null => note;
  const maxScroll = () => Math.max(0, contentHeight - height);
  const scrollTo = (value: number) => {
    scroll = Math.min(Math.max(0, value), maxScroll());
    content.y = -Math.round(scroll);
  };

  const drag = createDragScroll(view, ticker, { get: () => scroll, set: scrollTo }, content);
  attachScrollInput(view, content, new Rectangle(0, 0, width, height), drag, (delta) => scrollTo(scroll + delta));

  /** Heading and divider; returns the y under the divider. `reserveRight` keeps the name clear of Known. */
  const heading = (icon: string | null, quality: number, title: string, titleColor: number, subtitle: string,
    reserveRight: number): number => {
    body.addChild(at(itemSlot(kit, icon, ICON_SIZE, quality), PAD, PAD));
    const textX = PAD + ICON_SIZE + 12;
    const textWidth = inner - ICON_SIZE - 12;
    const name = wrapped(label(title, tinted(TEXT_STYLES.itemName, titleColor), textX, PAD + 2, 0, 0),
      textWidth - reserveRight);
    body.addChild(name);
    const subtitleY = Math.max(PAD + 38, name.y + name.height + 8);
    const sub = label(subtitle, TEXT_STYLES.label, textX, subtitleY);
    // A subtitle too wide for one line (a recipe's learn, yellow and grey on a phone) wraps, growing downwards.
    let subBottom = subtitleY + 16;
    if (sub.width > textWidth) {
      const lineHeight = sub.height;
      wrapped(sub, textWidth);
      sub.anchor.set(0, 0);
      sub.y = subtitleY - lineHeight / 2;
      subBottom = sub.y + sub.height + 8;
    }
    body.addChild(sub);
    const dividerY = Math.max(PAD + ICON_SIZE + 18, subBottom);
    body.addChild(at(piece(kit, "divider", inner, 2), PAD, dividerY));
    return dividerY + 2;
  };

  /**
   * "Zu's Notes" label, then the note as wrapped text. While editing (`editHeight` set) Save and Cancel join the label
   * and the text gives way to an empty block of that height, where the textarea sits. Visitors only see it when the
   * entry has a note. Returns the y under the block (`top` when it is left out).
   */
  const noteBlock = (top: number, { note: text, notes, canEdit, editHeight, error }: DetailView): number => {
    if (!canEdit && text.trim() === "" && !error) {
      return top;
    }
    const labelY = top + 14;
    body.addChild(label("Zu's Notes:", TEXT_STYLES.label, PAD, labelY));
    const buttonY = labelY - EDIT_HEIGHT / 2;
    const textY = labelY + NOTE_LABEL_GAP - 6;
    if (editHeight !== null) {
      // Save and Cancel stay on the label's line, next to the textarea: on a phone the keyboard covers the corner.
      const save = button(kit, "Save", EDIT_WIDTH, handlers.onSaveNote, EDIT_HEIGHT);
      const cancel = button(kit, "Cancel", EDIT_WIDTH, handlers.onCancelNote, EDIT_HEIGHT);
      body.addChild(at(save.view, PAD + inner - EDIT_WIDTH * 2 - EDIT_GAP, buttonY));
      body.addChild(at(cancel.view, PAD + inner - EDIT_WIDTH, buttonY));
      // The edit box: a focused field frame around the textarea, shown only while editing.
      body.addChild(at(piece(kit, "fieldFocus", inner + FIELD_FRAME * 2, editHeight + FIELD_FRAME * 2),
        PAD - FIELD_FRAME, textY - FIELD_FRAME));
      note = { x: PAD, y: textY, width: inner, height: editHeight };
      return textY + editHeight;
    }
    const shown = wrapped(text.trim() === ""
      ? label(NO_NOTE[notes], TEXT_STYLES.muted, PAD, textY, 0, 0)
      : label(text, TEXT_STYLES.body, PAD, textY, 0, 0), inner, true);
    body.addChild(shown);
    const blockHeight = Math.max(NOTE_MIN_HEIGHT, shown.height);
    note = { x: PAD, y: textY, width: inner, height: blockHeight };
    if (!error) {
      return textY + blockHeight;
    }
    const message = wrapped(label(error, tinted(TEXT_STYLES.label, PALETTE.text.error), PAD, textY + shown.height + 6,
      0, 0), inner);
    body.addChild(message);
    return Math.max(textY + blockHeight, message.y + message.height);
  };

  /**
   * An item's "Use:" texts, green as in the game's tooltip, wrapped at the pane width. Returns the top the
   * notes block should start from (unchanged when there is no description).
   */
  const useBlock = (top: number, description: string[] | undefined): number => {
    if (!description) {
      return top;
    }
    const text = wrapped(label(description.map((use) => `Use: ${use}`).join("\n"),
      tinted(TEXT_STYLES.body, QUALITY_COLORS.uncommon), PAD, top + 8, 0, 0), inner);
    body.addChild(text);
    return top + 14 + text.height;
  };

  /** One reagent: its slot (count included) and name, which selects the item. */
  const reagentCell = (itemId: number, count: number, x: number, y: number, columnWidth: number): Container => {
    const item = itemOf(itemId);
    const cell = at(new Container(), x, y);
    cell.addChild(itemSlot(kit, item.icon, SLOT_SIZE, item.quality, count));
    const name = label(item.name, tinted(TEXT_STYLES.body, qualityColor(item.quality)), SLOT_SIZE + 8,
      SLOT_SIZE / 2, 0, 0.5);
    name.style.wordWrapWidth = columnWidth - SLOT_SIZE - 14;
    cell.addChild(name);
    cell.hitArea = new Rectangle(0, 0, columnWidth - 6, SLOT_SIZE);
    return tappable(cell, () => {
      if (!drag.dragged()) {
        handlers.onSelectItem(itemId);
      }
    });
  };

  /** "Learned from" and the reagents grid. Returns the y under the grid. */
  const recipeSource = (recipe: Recipe, top: number): number => {
    const sourceLabel = label("Learned from:", TEXT_STYLES.label, PAD, top);
    body.addChild(sourceLabel, label(recipe.source === "item" ? "Recipe item" : "Trainer", TEXT_STYLES.body,
      PAD + sourceLabel.width + 6, top));
    const gridTop = top + 14 + SECTION_GAP;
    body.addChild(label("Reagents:", TEXT_STYLES.label, PAD, gridTop));
    const columns = Math.max(2, Math.floor(inner / REAGENT_COLUMN));
    const column = Math.floor(inner / columns);
    recipe.reagents.forEach(({ item, count }, i) => {
      body.addChild(reagentCell(item, count, PAD + (i % columns) * column,
        gridTop + 14 + Math.floor(i / columns) * REAGENT_ROW, column));
    });
    return gridTop + 14 + Math.ceil(recipe.reagents.length / columns) * REAGENT_ROW;
  };

  const showRecipe = (recipe: Recipe, view: DetailView): number => {
    const { known, editHeight } = view;
    const profession = professionByKey.get(recipe.profession);
    const created = recipe.item ? itemOf(recipe.item) : null;
    const editing = editHeight !== null;
    // When it can be learned, then the yellow and grey thresholds that say when it is worth crafting.
    const subtitle = [
      profession?.name ?? "",
      `learn ${recipe.learn ?? "??"}`,
      recipe.trivialLow > 0 ? `yellow ${recipe.trivialLow}, grey ${recipe.trivialHigh}` : "",
      recipe.count && recipe.count > 1 ? `creates ${recipe.count}` : "",
    ].filter(Boolean).join("  ·  ");
    const underDivider = heading(created?.icon ?? PROFESSION_ICONS[recipe.profession], created?.quality ?? 1,
      recipe.name, created ? qualityColor(created.quality) : PALETTE.text.header, subtitle,
      editing || known ? KNOWN_WIDTH : 0);
    if (!editing && known) {
      // While reading, the known flag is a quiet tag in the corner where the checkbox appears in edit mode.
      body.addChild(iconSprite(kit.icons.check, PAD + inner - 62, PAD + 12, PALETTE.gold.light, 0.8));
      body.addChild(label("Known", TEXT_STYLES.muted, PAD + inner - 50, PAD + 12));
    }
    if (editing) {
      // Known sits at the heading's top right, where the game shows its favourite star. Save keeps it.
      const knownBox = checkbox(kit, "Known", TEXT_STYLES.row,
        (checked) => handlers.onToggleKnown(recipe, checked), known);
      body.addChild(at(knownBox.view, PAD + inner - 72, PAD + 2));
    }

    return recipeSource(recipe, noteBlock(useBlock(underDivider, created?.use), view) + SECTION_GAP);
  };

  /**
   * "Found in" for herbs and fish: the zones their nodes spawn in or they are caught in, most likely first, as one
   * wrapped line. Returns the y where the next section starts (unchanged when the item has no known nodes).
   */
  const foundIn = (itemId: number, top: number): number => {
    const zones = locationsOf(itemId);
    if (zones.length === 0) {
      return top;
    }
    body.addChild(label("Found in:", TEXT_STYLES.label, PAD, top));
    const list = wrapped(label(zones.join(", "), TEXT_STYLES.body, PAD + 4, top + 14, 0, 0), inner - 4);
    body.addChild(list);
    return top + 14 + list.height + SECTION_GAP;
  };

  const showItem = (itemId: number, view: DetailView): number => {
    const item = itemOf(itemId);
    const gatherer = gathererOf(itemId);
    const subtitle = gatherer ? `Gathered with ${gatherer.name}` : "Reagent";
    const underDivider = heading(item.icon, item.quality, item.name, qualityColor(item.quality), subtitle, 0);

    const users = (recipesUsingItem.get(itemId) ?? []).slice()
      .sort((a, b) => a.profession.localeCompare(b.profession) || a.trivialLow - b.trivialLow);
    const top = foundIn(itemId, noteBlock(useBlock(underDivider, item.use), view) + SECTION_GAP);
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
    show: (selection, view) => {
      const { editHeight } = view;
      body.destroy({ children: true });
      body = new Container();
      content.addChild(body);
      note = null;
      const key = selectionKey(selection);
      if (!selection) {
        body.addChild(label("Select a recipe or a gatherable.", TEXT_STYLES.muted, width / 2, height / 2, 0.5));
        contentHeight = 0;
      } else {
        const bottom = selection.kind === "recipe" ? showRecipe(selection.recipe, view)
          : showItem(selection.itemId, view);
        // Room under the content for the corner Edit button, so the last line never hides behind it.
        contentHeight = bottom + PAD + (editHeight === null && view.canEdit ? EDIT_HEIGHT : 0);
      }
      edit.view.visible = selection !== null && editHeight === null && view.canEdit;
      if (key !== shownKey) {
        drag.stop();
        scroll = 0;
      }
      shownKey = key;
      const block = noteBlockBox();
      if (editHeight !== null && block) {
        // Keep the whole textarea in view when it fits, else its top.
        const { y, height: boxHeight } = block;
        const bottom = y + boxHeight + PAD;
        scroll = boxHeight + PAD * 2 > height ? y - PAD : Math.min(Math.max(scroll, bottom - height), y - PAD);
      }
      scrollTo(scroll);
    },
  };
};
