// The covered professions, in tab order. Kept apart from the generated data so saving and loading state doesn't pull
// the whole dataset in. keys.test.ts checks it against `professions.json`.
export const PROFESSION_KEYS = ["alchemy", "herbalism", "cooking", "fishing", "first-aid"] as const;

export type ProfessionKey = typeof PROFESSION_KEYS[number];

/**
 * How the tabs group, in order, with a gap between groups: the two primary professions, then Cooking and Fishing
 * (they go together), then First Aid.
 */
export const TAB_GROUPS: readonly (readonly ProfessionKey[])[] = [["alchemy", "herbalism"], ["cooking", "fishing"],
  ["first-aid"]];

/** Note and selection key of an item; recipes use `recipeKey` (`<profession>:<spell id>`). */
export const itemKey = (itemId: number): string => `item:${itemId}`;
