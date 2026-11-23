import { Container, Graphics, Sprite, Text, type TextStyle, type Texture } from "pixi.js";
import {
  type ArtKit, PALETTE, type PieceName, QUALITY_COLORS, TEXT_STYLES, type Quality, createNineSlice,
} from "./art";
import { loadIcon } from "./remoteIcons";

const QUALITY_BY_ID: Quality[] = ["poor", "common", "uncommon", "rare", "epic", "legendary"];

export const qualityColor = (quality: number): number => QUALITY_COLORS[QUALITY_BY_ID[quality] ?? "common"];

export const at = <T extends Container>(item: T, x: number, y: number): T => {
  item.position.set(Math.round(x), Math.round(y));
  return item;
};

export const label = (text: string, style: TextStyle, x = 0, y = 0, anchorX = 0, anchorY = 0.5): Text => {
  const t = new Text({ text, style });
  t.anchor.set(anchorX, anchorY);
  return at(t, x, y);
};

/** A copy of a shared style with another fill, so changing it never touches the shared one. */
export const tinted = (style: TextStyle, fill: number): TextStyle => {
  const copy = style.clone();
  copy.fill = fill;
  return copy;
};

/**
 * Wraps `text` at `width` on its own copy of the style. `breakWords` also breaks words longer than a line (user text:
 * URLs, coordinates).
 */
export const wrapped = (text: Text, width: number, breakWords = false): Text => {
  text.style = text.style.clone();
  text.style.wordWrap = true;
  text.style.wordWrapWidth = width;
  text.style.breakWords = breakWords;
  return text;
};

/** Makes `view` take pointer input with a hand cursor, calling `onTap` (if any) on a tap. */
export const tappable = <T extends Container>(view: T, onTap?: () => void): T => {
  view.eventMode = "static";
  view.cursor = "pointer";
  if (onTap) {
    view.on("pointertap", onTap);
  }
  return view;
};

/** Removes and destroys every child of `container`. */
export const clearChildren = (container: Container) => {
  container.removeChildren().forEach((child) => child.destroy({ children: true }));
};

export const piece = (kit: ArtKit, name: PieceName, width?: number, height?: number): Container => {
  const p = kit.pieces[name];
  return p.slice && width !== undefined && height !== undefined
    ? createNineSlice(p, width, height)
    : new Sprite(p.texture);
};

/** Adds the remote game icon to `parent` once it loads, `size` square, unless `parent` was destroyed meanwhile. */
const addIcon = (parent: Container, icon: string | null, size: number, x = 0, y = 0): Promise<Sprite | null> =>
  loadIcon(icon).then((texture) => {
    if (!texture || parent.destroyed) {
      return null;
    }
    const sprite = new Sprite(texture);
    sprite.width = size;
    sprite.height = size;
    parent.addChild(at(sprite, x, y));
    return sprite;
  });

export const iconSprite = (texture: Texture, x: number, y: number, tint: number, scale = 1): Sprite => {
  const sprite = new Sprite({ texture, anchor: 0.5, tint });
  sprite.scale.set(scale);
  return at(sprite, x, y);
};

/**
 * An item slot: dark background, the remote game icon once it loads, and a border tinted by item quality.
 * `count` above 1 is drawn in the bottom-right corner, as in game.
 */
export const itemSlot = (kit: ArtKit, icon: string | null, size: number, quality = 1, count = 1): Container => {
  const slot = new Container();
  slot.addChild(createNineSlice(kit.pieces.slotBackground, size, size));
  const inset = 3;
  // The icon loads into its own layer, under the border.
  const art = new Container();
  slot.addChild(art);
  const border = createNineSlice(kit.pieces.slotBorder, size, size);
  border.tint = qualityColor(quality);
  slot.addChild(border);
  if (count > 1) {
    slot.addChild(label(String(count), TEXT_STYLES.row, size - 4, size - 3, 1, 1));
  }
  void addIcon(art, icon, size - inset * 2, inset, inset);
  return slot;
};

/** A round icon (profession portrait): the remote icon masked to a circle. */
export const roundIcon = (icon: string | null, diameter: number): Container => {
  const holder = new Container();
  const mask = new Graphics().circle(diameter / 2, diameter / 2, diameter / 2).fill(0xffffff);
  holder.addChild(mask);
  void addIcon(holder, icon, diameter).then((sprite) => {
    if (sprite) {
      sprite.mask = mask;
    }
  });
  return holder;
};

export interface Button {
  view: Container;
  setEnabled: (enabled: boolean) => void;
  setCaption: (text: string) => void;
  /** Holds the pressed look (a toggle that is on) until set back; hover and press feedback pause meanwhile. */
  setLatched: (latched: boolean) => void;
}

/** A red WoW-style button with hover, pressed and disabled states. */
export const button = (kit: ArtKit, text: string, width: number, onPress: () => void, height = 24): Button => {
  const view = new Container();
  const states = {
    normal: createNineSlice(kit.pieces.button, width, height),
    hover: createNineSlice(kit.pieces.buttonHover, width, height),
    down: createNineSlice(kit.pieces.buttonDown, width, height),
    disabled: createNineSlice(kit.pieces.buttonDisabled, width, height),
  };
  Object.values(states).forEach((state) => view.addChild(state));
  const caption = label(text, TEXT_STYLES.button, width / 2, height / 2, 0.5);
  view.addChild(caption);
  let enabled = true;
  let latched = false;
  let current: keyof typeof states = "normal";
  const show = (state: keyof typeof states) => {
    current = state;
    Object.entries(states).forEach(([name, sprite]) => {
      sprite.visible = name === state;
    });
    caption.style = state === "disabled" ? tinted(TEXT_STYLES.button, PALETTE.text.disabled) : TEXT_STYLES.button;
  };
  show("normal");
  tappable(view, () => {
    if (enabled) {
      onPress();
    }
  });
  // Hover and press feedback, paused while disabled or latched.
  const feedback = () => enabled && !latched;
  view.on("pointerover", () => feedback() && show("hover"));
  view.on("pointerout", () => feedback() && show("normal"));
  view.on("pointerdown", () => feedback() && show("down"));
  view.on("pointerup", () => feedback() && current === "down" && show("hover"));
  return {
    view,
    setEnabled: (value) => {
      enabled = value;
      view.cursor = value ? "pointer" : "default";
      show(!value ? "disabled" : latched ? "down" : "normal");
    },
    setCaption: (value) => {
      caption.text = value;
    },
    setLatched: (value) => {
      latched = value;
      if (enabled) {
        show(value ? "down" : "normal");
      }
    },
  };
};

/** A checkbox with a gold check and a label to its right. The whole row toggles. */
export const checkbox = (
  kit: ArtKit, text: string, style: TextStyle, onToggle: (checked: boolean) => void, initial = false,
) => {
  const view = new Container();
  const box = piece(kit, "checkbox");
  const boxHover = piece(kit, "checkboxHover");
  boxHover.visible = false;
  const check = at(new Sprite({ texture: kit.icons.check, tint: PALETTE.gold.light }), 2, 2);
  view.addChild(box, boxHover, check, label(text, style, 28, 10));
  let checked = false;
  const set = (value: boolean) => {
    checked = value;
    check.visible = value;
  };
  set(initial);
  tappable(view, () => {
    set(!checked);
    onToggle(checked);
  });
  view.on("pointerover", () => {
    boxHover.visible = true;
  });
  view.on("pointerout", () => {
    boxHover.visible = false;
  });
  return { view, set };
};
