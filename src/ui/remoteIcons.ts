import { Assets, type Texture } from "pixi.js";

const ICON_BASE = "https://wow.zamimg.com/images/wow/icons/large/";

const cache = new Map<string, Promise<Texture | null>>();

/**
 * Loads a game icon by basename from Wowhead's image CDN (it sends `Access-Control-Allow-Origin: *`, so the image
 * can be a WebGL texture). Resolves to null when the icon is unknown or fails to load; callers keep an empty slot,
 * and the next request tries again.
 */
export const loadIcon = (name: string | null): Promise<Texture | null> => {
  if (!name) {
    return Promise.resolve(null);
  }
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }
  const pending = Assets.load<Texture>(`${ICON_BASE}${name}.jpg`).catch(() => {
    // Forget the failure so a later request retries (a brief network drop shouldn't blank the icon for good).
    cache.delete(name);
    return null;
  });
  cache.set(name, pending);
  return pending;
};
