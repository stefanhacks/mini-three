import { NineSliceSprite, Rectangle, type Renderer, type Texture, TilingSprite } from "pixi.js";
import { createDrawContext, createRandom } from "./draw";
import { ICONS, type IconName } from "./icons";
import { PIECES, type PieceName, type PieceSpec, type Slice } from "./pieces";

export interface ArtPiece {
  texture: Texture;
  /** Insets for `NineSliceSprite`; absent for fixed-size pieces. */
  slice?: Slice;
}

export interface ArtKit {
  pieces: Record<PieceName, ArtPiece>;
  icons: Record<IconName, Texture>;
  /** Seamless speckle texture to lay over panels with a `TilingSprite`. */
  stone: Texture;
  /** Resolution the textures were baked at. */
  resolution: number;
  destroy: () => void;
}

const STONE_SIZE = 128;

const bake = (renderer: Renderer, spec: PieceSpec, resolution: number, repeat = false): Texture => {
  const ctx = createDrawContext();
  spec.draw(ctx, spec.width, spec.height);
  const texture = renderer.generateTexture({
    target: ctx.g,
    frame: new Rectangle(0, 0, spec.width, spec.height),
    resolution,
    antialias: true,
    textureSourceOptions: repeat ? { addressMode: "repeat" } : undefined,
  });
  ctx.dispose();
  return texture;
};

/** Fine light and dark speckles plus faint blotches; each mark is also drawn wrapped, so the tile has no seam. */
const stoneTile: PieceSpec = {
  width: STONE_SIZE,
  height: STONE_SIZE,
  draw: ({ g }, w, h) => {
    const random = createRandom(7);
    const wrapped = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
      [-w, 0, w].forEach((dx) => [-h, 0, h].forEach((dy) => {
        if (x + dx + r > 0 && x + dx - r < w && y + dy + r > 0 && y + dy - r < h) {
          draw(x + dx, y + dy);
        }
      }));
    };
    for (let i = 0; i < 26; i++) {
      const r = 6 + random() * 18;
      const light = random() > 0.5;
      wrapped(random() * w, random() * h, r, (x, y) => {
        g.circle(x, y, r).fill({ color: light ? 0xfff3d6 : 0x000000, alpha: 0.015 });
      });
    }
    for (let i = 0; i < 900; i++) {
      const x = Math.floor(random() * w);
      const y = Math.floor(random() * h);
      const light = random() > 0.55;
      g.rect(x, y, 1, 1).fill({ color: light ? 0xfff3d6 : 0x000000, alpha: 0.04 + random() * 0.08 });
    }
  },
};

/**
 * Draws every art piece once with `Graphics` and renders it to a texture at the renderer's resolution, so the
 * pieces stay crisp at devicePixelRatio 2. Call once at startup, after `app.init`.
 */
export const createArtKit = (renderer: Renderer): ArtKit => {
  const resolution = renderer.resolution;
  const pieces = Object.fromEntries(Object.entries(PIECES).map(([name, spec]: [string, PieceSpec]) => [
    name,
    { texture: bake(renderer, spec, resolution), slice: spec.slice },
  ])) as Record<PieceName, ArtPiece>;
  const icons = Object.fromEntries(Object.entries(ICONS).map(([name, spec]: [string, PieceSpec]) => [
    name,
    bake(renderer, spec, resolution),
  ])) as Record<IconName, Texture>;
  const stone = bake(renderer, stoneTile, resolution, true);

  return {
    pieces,
    icons,
    stone,
    resolution,
    destroy: () => {
      Object.values(pieces).forEach((piece) => piece.texture.destroy(true));
      Object.values(icons).forEach((texture) => texture.destroy(true));
      stone.destroy(true);
    },
  };
};

/** A `NineSliceSprite` for a sliced piece, sized in CSS pixels. */
export const createNineSlice = (piece: ArtPiece, width: number, height: number): NineSliceSprite => {
  const slice = piece.slice ?? { left: 0, top: 0, right: 0, bottom: 0 };
  return new NineSliceSprite({
    texture: piece.texture,
    leftWidth: slice.left,
    topHeight: slice.top,
    rightWidth: slice.right,
    bottomHeight: slice.bottom,
    width,
    height,
  });
};

/** Stone speckle overlay for a panel area. */
export const createStoneOverlay = (kit: ArtKit, width: number, height: number, alpha = 1): TilingSprite => {
  const overlay = new TilingSprite({ texture: kit.stone, width, height });
  overlay.alpha = alpha;
  return overlay;
};
