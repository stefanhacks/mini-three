import { Container, type FederatedPointerEvent, Graphics, Rectangle, type TextStyle, type Ticker } from "pixi.js";
import { type ArtKit, PALETTE, TEXT_STYLES, createNineSlice, createStoneOverlay } from "../art";
import { itemOf } from "../../data/model";
import { at, iconSprite, label, piece, qualityColor, tappable, tinted } from "../widgets";
import { attachScrollInput, createDragScroll } from "./dragScroll";
import { DESKTOP_ROWS, type ListRow, type RowMetrics, rowHeight } from "./rows";

export interface ScrollList {
  view: Container;
  /** Replaces the rows. `resetScroll` jumps back to the top (a new profession); otherwise the offset is kept. */
  setRows: (rows: ListRow[], resetScroll: boolean) => void;
  setSelected: (key: string | null) => void;
  /** Reserves `px` at the top of the list, above the first row (0 gives it back). */
  setTopInset: (px: number) => void;
  /**
   * The scroll offset in rows (2.5 is halfway down the third row), to carry it into a list rebuilt with other row
   * heights.
   */
  getPosition: () => number;
  setPosition: (position: number) => void;
}

interface Handlers {
  onSelect: (row: ListRow) => void;
  onToggle: (headerId: string) => void;
}

const PAD = 6;
const SCROLLBAR = 17;
const MIN_THUMB = 24;
const ITEM_TEXT_X = 12;
const RECIPE_TEXT_X = 24;

interface RowView {
  view: Container;
  bind: (row: ListRow | null, selected: boolean) => void;
  row: ListRow | null;
}

// Item rows are tinted by quality. Styles are shared per quality: `bind` runs for every visible row on every scroll
// frame, and a fresh TextStyle each time would allocate and re-measure.
const qualityStyles = new Map<number, TextStyle>();
const qualityRowStyle = (quality: number): TextStyle => {
  let style = qualityStyles.get(quality);
  if (!style) {
    style = tinted(TEXT_STYLES.row, qualityColor(quality));
    qualityStyles.set(quality, style);
  }
  return style;
};

const rowKey = (row: ListRow): string => row.kind === "header" ? row.id : row.key;

/**
 * A virtual list: only the rows in view exist as display objects, recycled as the list scrolls, so a profession with
 * 500+ recipes costs the same as one with 20. Scrolls with the wheel, by dragging (and flinging) the content, and
 * by the scrollbar. `metrics` sets the row and header heights (taller on touch screens).
 */
export const createScrollList = (
  kit: ArtKit, width: number, height: number, handlers: Handlers, ticker: Ticker, metrics: RowMetrics = DESKTOP_ROWS,
): ScrollList => {
  const rowH = metrics.row;
  // The header art sits in its slot with 4 px to spare, as the gap above the first row.
  const headerH = metrics.header - 4;
  const view = new Container();
  view.addChild(piece(kit, "paneList", width, height));
  view.addChild(at(createStoneOverlay(kit, width - 2, height - 2, 0.6), 1, 1));

  const rowWidth = width - SCROLLBAR - 9;
  // `inset` reserves room at the top of the list (the search field's slot); rows start under it.
  let inset = 0;
  let viewport = height - PAD * 2;
  const content = at(new Container(), 4, PAD);
  const mask = new Graphics().rect(4, 2, rowWidth, height - 4).fill(0xffffff);
  content.mask = mask;
  view.addChild(content, mask);

  let rows: ListRow[] = [];
  let tops: number[] = [];
  let total = 0;
  let scroll = 0;
  let selectedKey: string | null = null;

  const makeRowView = (): RowView => {
    const holder = new Container();
    const header = createNineSlice(kit.pieces.header, rowWidth, headerH);
    const headerHover = createNineSlice(kit.pieces.headerHover, rowWidth, headerH);
    const headerText = label("", TEXT_STYLES.header, 8, headerH / 2);
    // Centred in a header-tall square at the right end, so its right gap matches the top and bottom ones.
    const toggle = iconSprite(kit.icons.minus, rowWidth - headerH / 2, headerH / 2, PALETTE.text.header);
    const hover = createNineSlice(kit.pieces.rowHover, rowWidth, rowH - 1);
    const selected = createNineSlice(kit.pieces.rowSelected, rowWidth, rowH - 1);
    const text = label("", TEXT_STYLES.row, 12, rowH / 2);
    const side = label("", TEXT_STYLES.muted, rowWidth - 8, rowH / 2, 1);
    // Known recipes get a check in a gutter left of the name; unknown ones leave it empty.
    const known = iconSprite(kit.icons.check, 13, rowH / 2, PALETTE.gold.light, 0.8);
    holder.addChild(header, headerHover, headerText, toggle, hover, selected, text, side, known);

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
          // The skill it is learnable at; "??" when no source knows it.
          side.text = row.recipe.learn !== undefined ? String(row.recipe.learn) : "??";
        } else {
          const item = itemOf(row.itemId);
          text.text = item.name;
          text.style = qualityRowStyle(item.quality);
          side.text = "";
        }
        holder.hitArea = new Rectangle(0, 0, rowWidth, isHeader ? headerH : rowH);
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
    tappable(holder, () => {
      const row = rowView.row;
      if (!row || drag.dragged()) {
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

  const pool: RowView[] = Array.from({ length: Math.ceil(viewport / rowH) + 2 }, makeRowView);
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
  /** Index of the row at the top of the view. */
  const firstShown = (): number => {
    let index = 0;
    while (index < rows.length - 1 && tops[index + 1] <= scroll) {
      index += 1;
    }
    return index;
  };

  const render = () => {
    scroll = Math.min(Math.max(0, scroll), maxScroll());
    const first = firstShown();
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

  const drag = createDragScroll(view, ticker, {
    get: () => scroll,
    set: (value) => {
      scroll = value;
      render();
    },
  });
  attachScrollInput(view, content, new Rectangle(0, 0, width - SCROLLBAR, height), drag, scrollBy);
  thumb.eventMode = "static";
  thumb.cursor = "grab";
  thumb.on("pointerdown", (event: FederatedPointerEvent) => {
    const free = trackHeight - thumb.height;
    drag.press(event, free > 0 ? maxScroll() / free : 0);
  });
  tappable(up, () => scrollBy(-3 * rowH));
  tappable(down, () => scrollBy(3 * rowH));

  return {
    view,
    setRows: (next, resetScroll) => {
      rows = next;
      tops = [];
      total = 0;
      rows.forEach((row, i) => {
        tops.push(total);
        total += rowHeight(row, rows[i + 1], metrics);
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
    setTopInset: (px) => {
      if (px === inset) {
        return;
      }
      inset = px;
      viewport = height - PAD * 2 - inset;
      content.y = PAD + inset;
      mask.clear().rect(4, 2 + inset, rowWidth, height - 4 - inset).fill(0xffffff);
      render();
    },
    getPosition: () => {
      const index = firstShown();
      const height = rows.length > 0 ? rowHeight(rows[index], rows[index + 1], metrics) : 1;
      return index + (scroll - (tops[index] ?? 0)) / height;
    },
    setPosition: (position) => {
      const index = Math.min(Math.floor(position), rows.length - 1);
      if (index < 0) {
        return;
      }
      scroll = tops[index] + (position - index) * rowHeight(rows[index], rows[index + 1], metrics);
      render();
    },
  };
};
