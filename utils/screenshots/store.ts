import { createIndexedDbThumbnailStore, type ClearableThumbnailStore } from '../rss/thumbnails';
import { createDefaultStore, type KeyValueStore } from '../storage/store';
import { pageKey } from './keys';

/** Screenshots live in their own database so they never compete with article thumbnails. */
export const MAX_SCREENSHOTS = 120;
export const createScreenshotStore = (): ClearableThumbnailStore => createIndexedDbThumbnailStore({ dbName: 'tabloid-screenshots', max: MAX_SCREENSHOTS });

const WANTED_KEY = 'bookmarks:shotUrls';

/**
 * The links whose pages should be screenshotted, mirrored into device-local storage by the new tab page
 * (like the feed list) so the background worker doesn't need to load the layout.
 */
export function createWantedScreenshots(store: KeyValueStore = createDefaultStore()) {
  const read = async () => {
    const raw = await store.get<unknown>(WANTED_KEY);
    return Array.isArray(raw) ? raw.filter((u): u is string => typeof u === 'string') : [];
  };
  return {
    /** The page keys to look out for. */
    async keys(): Promise<Set<string>> {
      return new Set((await read()).map(pageKey).filter((k): k is string => !!k));
    },
    async set(urls: readonly string[]) {
      const next = [...new Set(urls)].sort();
      if (JSON.stringify(next) !== JSON.stringify(await read())) await store.set(WANTED_KEY, next);
    },
  };
}
