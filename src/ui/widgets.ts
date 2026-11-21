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

export const piece = (kit: ArtKit, name: PieceName, width?: number, height?: number): Container => {
  const p = kit.pieces[name];
  return p.slice && width !== undefined && height !== undefined
    ? createNineSlice(p, width, height)
    : new Sprite(p.texture);
};

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
  const art = new Container();
  slot.addChild(art);
  const border = createNineSlice(kit.pieces.slotBorder, size, size);
  border.tint = qualityColor(quality);
  slot.addChild(border);
  if (count > 1) {
    slot.addChild(label(String(count), TEXT_STYLES.row, size - 4, size - 3, 1, 1));
  }
  void loadIcon(icon).then((texture) => {
    if (!texture || slot.destroyed) {
      return;
    }
    const sprite = new Sprite(texture);
    sprite.width = size - inset * 2;
    sprite.height = size - inset * 2;
    art.addChild(at(sprite, inset, inset));
  });
  return slot;
};

/** A round icon (profession portrait): the remote icon masked to a circle. */
export const roundIcon = (icon: string | null, diameter: number): Container => {
  const holder = new Container();
  const mask = new Graphics().circle(diameter / 2, diameter / 2, diameter / 2).fill(0xffffff);
  holder.addChild(mask);
  void loadIcon(icon).then((texture) => {
    if (!texture || holder.destroyed) {
      return;
    }
    const sprite = new Sprite(texture);
    sprite.width = diameter;
    sprite.height = diameter;
    sprite.mask = mask;
    holder.addChild(sprite);
  });
  return holder;
};

export interface Button {
  view: Container;
  setEnabled: (enabled: boolean) => void;
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
  let current: keyof typeof states = "normal";
  const show = (state: keyof typeof states) => {
    current = state;
    Object.entries(states).forEach(([name, sprite]) => {
      sprite.visible = name === state;
    });
    caption.style = state === "disabled" ? tinted(TEXT_STYLES.button, PALETTE.text.disabled) : TEXT_STYLES.button;
  };
  show("normal");
  view.eventMode = "static";
  view.cursor = "pointer";
  view.on("pointerover", () => enabled && show("hover"));
  view.on("pointerout", () => enabled && show("normal"));
  view.on("pointerdown", () => enabled && show("down"));
  view.on("pointerup", () => enabled && current === "down" && show("hover"));
  view.on("pointertap", () => {
    if (enabled) {
      onPress();
    }
  });
  return {
    view,
    setEnabled: (value) => {
      enabled = value;
      view.cursor = value ? "pointer" : "default";
      show(value ? "normal" : "disabled");
    },
  };
};

/** A checkbox with a gold check and a label to its right. The whole row toggles. */
export const checkbox = (kit: ArtKit, text: string, style: TextStyle, onToggle: (checked: boolean) => void) => {
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
  set(false);
  view.eventMode = "static";
  view.cursor = "pointer";
  view.on("pointerover", () => {
    boxHover.visible = true;
  });
  view.on("pointerout", () => {
    boxHover.visible = false;
  });
  view.on("pointertap", () => {
    set(!checked);
    onToggle(checked);
  });
  return { view, set };
};
