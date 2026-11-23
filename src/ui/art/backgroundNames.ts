// The background scenes by name, in cycling order. Kept apart from their drawing so the notes function can check a
// saved choice without bundling Pixi.

export const BACKGROUND_NAMES = ["moonlitForest", "duskCoast", "crystalCavern", "mistyPeaks"] as const;

export type BackgroundVariant = typeof BACKGROUND_NAMES[number];

/** The scene shown until the owner picks one. */
export const DEFAULT_BACKGROUND: BackgroundVariant = "moonlitForest";

export const isBackground = (value: unknown): value is BackgroundVariant =>
  typeof value === "string" && (BACKGROUND_NAMES as readonly string[]).includes(value);

/** The scene after `variant`, wrapping around. */
export const nextBackground = (variant: BackgroundVariant): BackgroundVariant =>
  BACKGROUND_NAMES[(BACKGROUND_NAMES.indexOf(variant) + 1) % BACKGROUND_NAMES.length];
