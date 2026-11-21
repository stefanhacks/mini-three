import { Container, type FederatedPointerEvent, type FederatedWheelEvent, Graphics, Rectangle } from "pixi.js";
import { type ArtKit, PALETTE, TEXT_STYLES, createNineSlice, createStoneOverlay } from "../art";
import { at, iconSprite, label, piece, qualityColor, tinted } from "../widgets";
import { type ListRow, ROW_HEIGHT, rowHeight } from "./rows";
import { itemOf } from "../../data/model";

export interface ScrollList {
  view: Container;
  /** Replaces the rows. `resetScroll` jumps back to the top (a new profession); otherwise the offset is kept. */
  setRows: (rows: ListRow[], resetScroll: boolean) => void;
  setSelected: (key: string | null) => void;
}

interface Handlers {
  onSelect: (row: ListRow) => void;
  onToggle: (headerId: string) => void;
}

const PAD = 6;
const SCROLLBAR = 17;
const DRAG_THRESHOLD = 4;
const WHEEL_LINE = 20;
const MIN_THUMB = 24;
const ITEM_TEXT_X = 12;
const RECIPE_TEXT_X = 24;

interface RowView {
  view: Container;
  bind: (row: ListRow | null, selected: boolean) => void;
  row: ListRow | null;
}

const rowKey = (row: ListRow): string => row.kind === "header" ? row.id : row.key;

/**
 * A virtual list: only the rows in view exist as display objects, recycled as the list scrolls, so a profession with
 * 500+ recipes costs the same as one with 20. Scrolls with the wheel, by dragging the content, and by the scrollbar.
 */
export const createScrollList = (kit: ArtKit, width: number, height: number, handlers: Handlers): ScrollList => {
  const view = new Container();
  view.addChild(piece(kit, "paneList", width, height));
  view.addChild(at(createStoneOverlay(kit, width - 2, height - 2, 0.6), 1, 1));

  const rowWidth = width - SCROLLBAR - 9;
  const viewport = height - PAD * 2;
  const content = at(new Container(), 4, PAD);
  const mask = new Graphics().rect(4, 2, rowWidth, height - 4).fill(0xffffff);
  content.mask = mask;
  view.addChild(content, mask);

  let rows: ListRow[] = [];
  let tops: number[] = [];
  let total = 0;
  let scroll = 0;
  let selectedKey: string | null = null;
  let dragged = false;

  const makeRowView = (): RowView => {
    const holder = new Container();
    const header = createNineSlice(kit.pieces.header, rowWidth, 22);
    const headerHover = createNineSlice(kit.pieces.headerHover, rowWidth, 22);
    const headerText = label("", TEXT_STYLES.header, 8, 11);
    const toggle = iconSprite(kit.icons.minus, rowWidth - 10, 11, PALETTE.text.header);
    const hover = createNineSlice(kit.pieces.rowHover, rowWidth, ROW_HEIGHT - 1);
    const selected = createNineSlice(kit.pieces.rowSelected, rowWidth, ROW_HEIGHT - 1);
    const text = label("", TEXT_STYLES.row, 12, ROW_HEIGHT / 2);
    const side = label("", TEXT_STYLES.muted, rowWidth - 8, ROW_HEIGHT / 2, 1);
    // Known recipes get a check in a gutter left of the name; unknown ones leave it empty.
    const known = iconSprite(kit.icons.check, 13, ROW_HEIGHT / 2, PALETTE.gold.light, 0.8);
    holder.addChild(header, headerHover, headerText, toggle, hover, selected, text, side, known);
    holder.eventMode = "static";
    holder.cursor = "pointer";

    const rowView: RowView = {
      view: holder,
      row: null,
      bind: (row, isSelected) => {
        rowView.row = row;
        holder.visible = row !== null;
        if (!row) {
          return;
        }
        const isHeader = row.kind === "header";
        header.visible = isHeader;
        headerHover.visible = false;
        headerText.visible = isHeader;
        toggle.visible = isHeader;
        hover.visible = false;
        selected.visible = !isHeader && isSelected;
        text.visible = !isHeader;
        side.visible = !isHeader;
        known.visible = row.kind === "recipe" && row.known;
        text.x = row.kind === "recipe" ? RECIPE_TEXT_X : ITEM_TEXT_X;
        if (row.kind === "header") {
          headerText.text = row.label;
          toggle.texture = row.collapsed ? kit.icons.plus : kit.icons.minus;
        } else if (row.kind === "recipe") {
          text.text = row.recipe.name;
          text.style = TEXT_STYLES.row;
          side.text = row.recipe.trivialLow > 0 ? String(row.recipe.trivialLow) : "";
        } else {
          const item = itemOf(row.itemId);
          text.text = item.name;
          text.style = tinted(TEXT_STYLES.row, qualityColor(item.quality));
          side.text = "";
        }
        holder.hitArea = new Rectangle(0, 0, rowWidth, isHeader ? 22 : ROW_HEIGHT);
      },
    };
    holder.on("pointerover", () => {
      if (rowView.row?.kind === "header") {
        headerHover.visible = true;
      } else if (rowView.row) {
        hover.visible = true;
      }
    });
    holder.on("pointerout", () => {
      headerHover.visible = false;
      hover.visible = false;
    });
    holder.on("pointertap", () => {
      const row = rowView.row;
      if (!row || dragged) {
        return;
      }
      if (row.kind === "header") {
        handlers.onToggle(row.id);
      } else {
        handlers.onSelect(row);
      }
    });
    return rowView;
  };

  const pool: RowView[] = Array.from({ length: Math.ceil(viewport / ROW_HEIGHT) + 2 }, makeRowView);
  pool.forEach((rowView) => content.addChild(rowView.view));

  // Scrollbar: arrows, track and a draggable thumb.
  const barX = width - SCROLLBAR;
  const trackTop = 22;
  const trackHeight = height - trackTop * 2;
  const up = iconSprite(kit.icons.chevronUp, barX + 6, 12, PALETTE.gold.light);
  const down = iconSprite(kit.icons.chevronDown, barX + 6, height - 12, PALETTE.gold.light);
  const track = at(piece(kit, "scrollTrack", 12, trackHeight), barX, trackTop);
  const thumb = createNineSlice(kit.pieces.scrollThumb, 10, MIN_THUMB);
  view.addChild(up, down, track, thumb);

  const maxScroll = () => Math.max(0, total - viewport);

  const render = () => {
    scroll = Math.min(Math.max(0, scroll), maxScroll());
    let first = 0;
    while (first < rows.length - 1 && tops[first + 1] <= scroll) {
      first += 1;
    }
    pool.forEach((rowView, i) => {
      const index = first + i;
      const row = index < rows.length && tops[index] - scroll < viewport ? rows[index] : null;
      rowView.bind(row, row !== null && rowKey(row) === selectedKey);
      if (row) {
        rowView.view.position.set(0, Math.round(tops[index] - scroll));
      }
    });
    const scrollable = maxScroll() > 0;
    [up, down, thumb].forEach((part) => {
      part.visible = scrollable;
    });
    if (scrollable) {
      const thumbHeight = Math.max(MIN_THUMB, Math.round(trackHeight * viewport / total));
      thumb.height = thumbHeight;
      at(thumb, barX + 1, trackTop + Math.round((trackHeight - thumbHeight) * scroll / maxScroll()));
    }
  };

  const scrollBy = (delta: number) => {
    scroll += delta;
    render();
  };

  // Wheel and drag on the content area.
  const area = new Container();
  area.hitArea = new Rectangle(0, 0, width - SCROLLBAR, height);
  area.eventMode = "static";
  view.addChildAt(area, 2);
  view.eventMode = "static";
  view.on("wheel", (event: FederatedWheelEvent) => {
    scrollBy(event.deltaMode === 1 ? event.deltaY * WHEEL_LINE : event.deltaY);
  });

  let drag: { startY: number; startScroll: number; perPixel: number } | null = null;
  const startDrag = (event: FederatedPointerEvent, perPixel: number) => {
    drag = { startY: event.global.y, startScroll: scroll, perPixel };
    dragged = false;
  };
  content.eventMode = "static";
  area.on("pointerdown", (event: FederatedPointerEvent) => startDrag(event, -1));
  content.on("pointerdown", (event: FederatedPointerEvent) => startDrag(event, -1));
  thumb.eventMode = "static";
  thumb.cursor = "grab";
  thumb.on("pointerdown", (event: FederatedPointerEvent) => {
    const free = trackHeight - thumb.height;
    startDrag(event, free > 0 ? maxScroll() / free : 0);
  });
  view.on("globalpointermove", (event: FederatedPointerEvent) => {
    if (!drag) {
      return;
    }
    const scale = view.worldTransform.d || 1;
    const dy = (event.global.y - drag.startY) / scale;
    if (Math.abs(dy) > DRAG_THRESHOLD) {
      dragged = true;
    }
    if (dragged) {
      scroll = drag.startScroll + dy * drag.perPixel;
      render();
    }
  });
  const endDrag = () => {
    drag = null;
  };
  view.on("pointerup", endDrag);
  view.on("pointerupoutside", endDrag);

  [[up, -3], [down, 3]].forEach(([arrow, rowsBy]) => {
    const sprite = arrow as Container;
    sprite.eventMode = "static";
    sprite.cursor = "pointer";
    sprite.on("pointertap", () => scrollBy((rowsBy as number) * ROW_HEIGHT));
  });

  return {
    view,
    setRows: (next, resetScroll) => {
      rows = next;
      tops = [];
      total = 0;
      rows.forEach((row, i) => {
        tops.push(total);
        total += rowHeight(row, rows[i + 1]);
      });
      if (resetScroll) {
        scroll = 0;
      }
      render();
    },
    setSelected: (key) => {
      selectedKey = key;
      render();
    },
  };
};
