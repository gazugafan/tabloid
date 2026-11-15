import { createDefaultStore, type KeyValueStore } from '../storage/store';
import { shortHash } from './text';
import type { CachedFeed } from './types';

const PREFIX = 'rss:feed:';
const INDEX_KEY = 'rss:index';

const keyFor = (url: string) => `${PREFIX}${shortHash(url)}${shortHash([...url].reverse().join(''))}`;

/**
 * Per-feed cache in device-local storage, so the new tab renders instantly and works offline.
 * Never synced: it can be large and is cheap to rebuild.
 */
export function createFeedCache(store: KeyValueStore = createDefaultStore()) {
  return {
    get: (url: string) => store.get<CachedFeed>(keyFor(url)),

    async getMany(urls: readonly string[]): Promise<Map<string, CachedFeed>> {
      const found = await store.getMany(urls.map(keyFor));
      const result = new Map<string, CachedFeed>();
      for (const url of urls) {
        const feed = found[keyFor(url)] as CachedFeed | undefined;
        if (feed) result.set(url, feed);
      }
      return result;
    },

    async put(feed: CachedFeed): Promise<void> {
      await store.set(keyFor(feed.url), feed);
      const index = (await store.get<string[]>(INDEX_KEY)) ?? [];
      if (!index.includes(feed.url)) await store.set(INDEX_KEY, [...index, feed.url]);
    },

    /** Forgets cached feeds that nothing uses any more. */
    async prune(keep: readonly string[]): Promise<void> {
      const index = (await store.get<string[]>(INDEX_KEY)) ?? [];
      const wanted = new Set(keep);
      const stale = index.filter((url) => !wanted.has(url));
      if (stale.length === 0) return;
      await store.removeMany(stale.map(keyFor));
      await store.set(INDEX_KEY, index.filter((url) => wanted.has(url)));
    },

    /** Fires (debounce on your side) when any cached feed changed, including from the background worker. */
    subscribe: (onChange: () => void) => store.subscribe((keys) => keys.some((k) => k.startsWith(PREFIX)) && onChange()),
  };
}

export type FeedCache = ReturnType<typeof createFeedCache>;
