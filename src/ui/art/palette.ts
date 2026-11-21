/**
 * Colour tokens for the art kit: dark stone panels, gold-bronze trims, warm header text.
 * Everything drawn by the texture factory and the text styles reads from here.
 */
export const PALETTE = {
  ink: 0x050403,
  stone: {
    deepest: 0x0b0a09,
    deep: 0x12110f,
    base: 0x1b1916,
    raised: 0x26231f,
    edge: 0x3a3530,
  },
  warm: {
    deep: 0x16110b,
    base: 0x221a11,
    raised: 0x2e2216,
  },
  bronze: {
    dark: 0x3b2a12,
    base: 0x6e5326,
    light: 0x9c7a3a,
  },
  gold: {
    dark: 0x8c6a2c,
    base: 0xc29a48,
    light: 0xe6c977,
    bright: 0xfff0b0,
  },
  red: {
    dark: 0x3e0805,
    base: 0x7c150c,
    light: 0xb02a17,
  },
  text: {
    title: 0xf2dfa0,
    header: 0xffd100,
    body: 0xf4efe4,
    muted: 0x8f877b,
    label: 0xffd100,
    disabled: 0x6b655c,
    shadow: 0x000000,
  },
  skill: {
    start: 0xb3122a,
    mid: 0xe0533a,
    end: 0xf39a5b,
  },
  highlight: {
    hover: 0x9fc4ff,
    selected: 0xf4c95d,
  },
} as const;

export type Quality = "poor" | "common" | "uncommon" | "rare" | "epic";

/** Item quality colours, used for item name text and to tint the item slot border. */
export const QUALITY_COLORS: Record<Quality, number> = {
  poor: 0x9d9d9d,
  common: 0xffffff,
  uncommon: 0x1eff00,
  rare: 0x0070dd,
  epic: 0xa335ee,
};

export type Difficulty = "optimal" | "medium" | "easy" | "trivial";

/** Recipe difficulty colours, for the chevron icon next to a recipe name. */
export const DIFFICULTY_COLORS: Record<Difficulty, number> = {
  optimal: 0xff8040,
  medium: 0xffff00,
  easy: 0x40bf40,
  trivial: 0x808080,
};
