/**
 * Temporary art-kit showcase (stage 2). Lays every piece out roughly like the profession window, over the
 * blurred backdrop. Stage 3 replaces this file with the real popup; nothing in `src/ui/art` depends on it.
 */
import { type Application, Container, Sprite, Text, type TextStyle, type Texture } from "pixi.js";
import {
  type ArtKit, type Backdrop, DIFFICULTY_COLORS, type Difficulty, FRAME_TITLE_HEIGHT, PALETTE,
  type PieceName, type Quality, QUALITY_COLORS, SHADOW_SPREAD, TAB_GLOW, TEXT_STYLES, createBackdrop,
  createNineSlice, createStoneOverlay,
} from "./ui/art";

const WINDOW_WIDTH = 720;
const WINDOW_HEIGHT = 580;
const TAB_SIZE = 48 + TAB_GLOW * 2;
const MARGIN = 12;
const REAGENT_NAMES: Record<Quality, string> = {
  poor: "Broken Fang",
  common: "Strange Dust",
  uncommon: "Lesser Essence",
  rare: "Glimmering Shard",
  epic: "Nexus Crystal",
};

const label = (text: string, style: TextStyle, x: number, y: number, anchorX = 0, anchorY = 0.5): Text => {
  const t = new Text({ text, style });
  t.anchor.set(anchorX, anchorY);
  t.position.set(Math.round(x), Math.round(y));
  return t;
};

const icon = (texture: Texture, x: number, y: number, tint: number, scale = 1): Sprite => {
  const sprite = new Sprite({ texture, anchor: 0.5, tint });
  sprite.position.set(x, y);
  sprite.scale.set(scale);
  return sprite;
};

const at = <T extends Container>(item: T, x: number, y: number): T => {
  item.position.set(x, y);
  return item;
};

const piece = (kit: ArtKit, name: PieceName, x: number, y: number, w?: number, h?: number): Container => {
  const p = kit.pieces[name];
  return at(p.slice && w !== undefined && h !== undefined
    ? createNineSlice(p, w, h)
    : new Sprite(p.texture), x, y);
};

const buildList = (kit: ArtKit, width: number, height: number): Container => {
  const list = new Container();
  list.addChild(piece(kit, "paneList", 0, 0, width, height));
  list.addChild(createStoneOverlay(kit, width - 2, height - 2, 0.6)).position.set(1, 1);

  const groups: [string, [string, Difficulty | null][]][] = [
    ["Camping", [["Enchanted Lute", "medium"]]],
    ["Reagents", [["Dust to Motes", null]]],
    ["Runed Enchanting Rods", [["Runed Copper Rod", null]]],
    ["Chest Enchants", [["Enchant Chest - Inferior Stamina", "optimal"]]],
    ["Bracer Enchants", [["Enchant Bracer - Minor Deflect", "optimal"], ["Enchant Bracer - Inferior Stamina",
      "medium"]]],
    ["Wands", [["Lesser Magic Wand", "optimal"], ["Novice's Practice Wand", "easy"], ["Minor Wizard Oil",
      "trivial"]]],
  ];
  const rowWidth = width - 26;
  let y = 6;
  let rowIndex = 0;
  groups.forEach(([name, rows], groupIndex) => {
    list.addChild(piece(kit, groupIndex === 1 ? "headerHover" : "header", 4, y, rowWidth, 22));
    list.addChild(label(name, TEXT_STYLES.header, 12, y + 11));
    list.addChild(icon(groupIndex === 2 ? kit.icons.plus : kit.icons.minus, rowWidth - 8, y + 11,
      PALETTE.text.header));
    y += 26;
    rows.forEach(([text, difficulty]) => {
      const row = at(new Container(), 4, y);
      const hover = createNineSlice(kit.pieces.rowHover, rowWidth, 19);
      const selected = createNineSlice(kit.pieces.rowSelected, rowWidth, 19);
      selected.visible = text === "Enchant Bracer - Minor Deflect";
      hover.visible = rowIndex === 0;
      row.addChild(hover, selected);
      if (difficulty) {
        row.addChild(icon(kit.icons.difficulty, 14, 10, DIFFICULTY_COLORS[difficulty], 0.8));
      }
      row.addChild(label(text, TEXT_STYLES.row, 26, 10));
      row.eventMode = "static";
      row.cursor = "pointer";
      row.on("pointerover", () => {
        hover.visible = true;
      });
      row.on("pointerout", () => {
        hover.visible = false;
      });
      list.addChild(row);
      y += 20;
      rowIndex += 1;
    });
    y += 6;
  });

  // Scrollbar on the right edge of the pane.
  const barX = width - 17;
  list.addChild(icon(kit.icons.chevronUp, barX + 6, 12, PALETTE.gold.light));
  list.addChild(piece(kit, "scrollTrack", barX, 22, 12, height - 44));
  list.addChild(piece(kit, "scrollThumb", barX + 1, 26, 10, 90));
  list.addChild(icon(kit.icons.chevronDown, barX + 6, height - 12, PALETTE.gold.light));
  return list;
};

const slotWithItem = (kit: ArtKit, quality: Quality, size: number): Container => {
  const slot = new Container();
  slot.addChild(createNineSlice(kit.pieces.slotBackground, size, size));
  const border = createNineSlice(kit.pieces.slotBorder, size, size);
  border.tint = QUALITY_COLORS[quality];
  slot.addChild(border);
  return slot;
};

const buildDetail = (kit: ArtKit, width: number, height: number): Container => {
  const detail = new Container();
  detail.addChild(piece(kit, "paneDetail", 0, 0, width, height));
  detail.addChild(createStoneOverlay(kit, width - 2, height - 2, 0.5)).position.set(1, 1);

  detail.addChild(at(slotWithItem(kit, "rare", 48), 18, 18));
  detail.addChild(label("Enchant Bracer - Minor Deflect", TEXT_STYLES.itemName, 78, 30));
  detail.addChild(icon(kit.icons.star, width - 22, 30, PALETTE.gold.light, 1.2));
  detail.addChild(label("Requires: Runed Copper Rod", TEXT_STYLES.label, 78, 52));
  const body = label("Permanently enchant bracers so that the defense skill of the wearer is increased by 3.",
    TEXT_STYLES.body, 18, 80, 0, 0);
  body.style.wordWrapWidth = width - 36;
  detail.addChild(body);
  detail.addChild(piece(kit, "divider", 18, 126, width - 36, 2));

  detail.addChild(label("Reagents:", TEXT_STYLES.label, 18, 146));
  const qualities: Quality[] = ["poor", "common", "uncommon", "rare", "epic"];
  qualities.forEach((quality, i) => {
    const x = 18 + (i % 2) * 180;
    const y = 160 + Math.floor(i / 2) * 50;
    detail.addChild(at(slotWithItem(kit, quality, 42), x, y));
    const name = label(`${i + 1}/${i + 2} ${REAGENT_NAMES[quality]}`, TEXT_STYLES.row, x + 50, y + 21);
    name.style = name.style.clone();
    name.style.fill = QUALITY_COLORS[quality];
    detail.addChild(name);
  });

  detail.addChild(label("Notes:", TEXT_STYLES.label, 18, 322));
  detail.addChild(piece(kit, "fieldFocus", 18, 334, width - 36, 84));
  const notes = label("Dust from disenchanting green bracers. Ask the guild bank first.", TEXT_STYLES.body,
    26, 342, 0, 0);
  notes.style = notes.style.clone();
  notes.style.wordWrapWidth = width - 52;
  detail.addChild(notes);

  detail.addChild(piece(kit, "checkbox", 18, height - 36));
  detail.addChild(at(new Sprite({ texture: kit.icons.check, tint: PALETTE.gold.light }), 20, height - 34));
  detail.addChild(label("Known", TEXT_STYLES.row, 44, height - 26));
  detail.addChild(piece(kit, "checkboxHover", 110, height - 36));
  detail.addChild(label("Known only", TEXT_STYLES.row, 136, height - 26));
  return detail;
};

const button = (kit: ArtKit, name: PieceName, text: string, x: number, y: number, w: number): Container => {
  const holder = at(new Container(), x, y);
  holder.addChild(createNineSlice(kit.pieces[name], w, 24));
  const caption = label(text, TEXT_STYLES.button, w / 2, 12, 0.5);
  if (name === "buttonDisabled") {
    caption.style = caption.style.clone();
    caption.style.fill = PALETTE.text.disabled;
  }
  holder.addChild(caption);
  return holder;
};

const buildWindow = (kit: ArtKit): Container => {
  const win = new Container();
  const w = WINDOW_WIDTH;
  const h = WINDOW_HEIGHT;
  win.addChild(piece(kit, "frameShadow", -SHADOW_SPREAD, -SHADOW_SPREAD + 6, w + SHADOW_SPREAD * 2,
    h + SHADOW_SPREAD * 2));

  // Side tabs sit behind the frame's right edge.
  const tabNames = ["Al", "Ta", "En", "Mi"];
  tabNames.forEach((name, i) => {
    const active = i === 2;
    const tab = piece(kit, active ? "tabActive" : "tab", w - 10 + (active ? 2 : 0) - TAB_GLOW, 52 + i * 54 - TAB_GLOW,
      TAB_SIZE, TAB_SIZE);
    win.addChild(tab);
    win.addChild(label(name, TEXT_STYLES.title, w - 10 + 24 + (active ? 2 : 0), 52 + i * 54 + 24, 0.5));
  });

  win.addChild(piece(kit, "frame", 0, 0, w, h));
  win.addChild(createStoneOverlay(kit, w - 10, h - FRAME_TITLE_HEIGHT - 5, 0.8)).position.set(5, FRAME_TITLE_HEIGHT);
  win.addChild(label("Enchanting", TEXT_STYLES.title, w / 2, FRAME_TITLE_HEIGHT / 2 + 1, 0.5));
  win.addChild(piece(kit, "closeButton", w - 30, 4));

  // Portrait medallion overlapping the top-left corner.
  win.addChild(piece(kit, "portraitBack", -16, -16));
  win.addChild(icon(kit.icons.star, 20, 20, PALETTE.gold.light, 2.2));
  win.addChild(piece(kit, "portraitRing", -16, -16));

  // Skill bar.
  const barX = 120;
  const barW = 440;
  win.addChild(piece(kit, "barTrack", barX, 42, barW, 18));
  win.addChild(piece(kit, "barFill", barX + 3, 45, Math.round((barW - 6) * (21 / 75)), 12));
  win.addChild(label("Enchanting 21/75", TEXT_STYLES.bar, barX + barW / 2, 51, 0.5));

  // Search and filter.
  win.addChild(piece(kit, "field", 16, 74, 190, 24));
  win.addChild(icon(kit.icons.search, 28, 86, PALETTE.text.muted));
  win.addChild(label("Search", TEXT_STYLES.muted, 40, 86));
  win.addChild(button(kit, "button", "Filter", 214, 74, 92));
  win.addChild(icon(kit.icons.chevronRight, 214 + 80, 86, PALETTE.text.header, 0.8));

  win.addChild(at(buildList(kit, 290, h - 122), 16, 106));
  win.addChild(at(buildDetail(kit, w - 330, h - 112), 314, 70));

  const buttons: [PieceName, string][] = [["buttonDisabled", "Create All"], ["buttonHover", "Hover"],
    ["buttonDown", "Down"]];
  buttons.forEach(([name, text], i) => {
    win.addChild(button(kit, name, text, w - 16 - 96 * (3 - i), h - 34, 90));
  });
  return win;
};

/** Mounts the showcase. Click or press B to cycle the background. */
export const createShowcase = (app: Application, kit: ArtKit): void => {
  const backdrop: Backdrop = createBackdrop(app.renderer);
  const win = buildWindow(kit);
  const hint = label("", TEXT_STYLES.muted, MARGIN, 0, 0, 1);
  app.stage.addChild(backdrop.view, win, hint);

  const showVariant = () => {
    hint.text = `Background: ${backdrop.variant} (click or press B to change)`;
  };
  const cycle = () => {
    backdrop.next();
    showVariant();
  };

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("pointertap", (event) => {
    if (!win.getBounds().containsPoint(event.global.x, event.global.y)) {
      cycle();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "b") {
      cycle();
    }
  });

  const layout = (width: number, height: number) => {
    backdrop.resize(width, height);
    const fullWidth = WINDOW_WIDTH + TAB_SIZE + 24;
    const fullHeight = WINDOW_HEIGHT + 48;
    const scale = Math.min(1, (width - MARGIN * 2) / fullWidth, (height - MARGIN * 2) / fullHeight);
    win.scale.set(scale);
    win.position.set(
      Math.round((width - (WINDOW_WIDTH + TAB_SIZE - 16) * scale) / 2 + 16 * scale),
      Math.round((height - WINDOW_HEIGHT * scale) / 2),
    );
    hint.position.set(MARGIN, height - MARGIN);
  };
  app.renderer.on("resize", layout);
  layout(app.screen.width, app.screen.height);
  showVariant();
  window.debug = { ...window.debug, backdrop };
};
