import { createDefaultStore, type KeyValueStore } from '../storage/store';
import { safeUrl } from './text';

const KEY = 'rss:wanted';
const DEFAULT_MINUTES = 30;

/** A feed the layout uses, and how often (in minutes) its widget wants it refreshed. */
export interface WantedFeed {
  url: string;
  minutes: number;
}

/** One entry per feed; a feed used by several widgets gets the shortest interval asked for. */
export function mergeWanted(entries: readonly WantedFeed[]): WantedFeed[] {
  const byUrl = new Map<string, number>();
  for (const { url, minutes } of entries) byUrl.set(url, Math.min(byUrl.get(url) ?? Infinity, minutes));
  return [...byUrl].map(([url, minutes]) => ({ url, minutes })).sort((a, b) => a.url.localeCompare(b.url));
}

/** Reads stored data, including the older shape that was a plain list of addresses. */
function sanitize(raw: unknown): WantedFeed[] {
  if (!Array.isArray(raw)) return [];
  const entries: WantedFeed[] = [];
  for (const entry of raw) {
    const url = safeUrl(typeof entry === 'string' ? entry : (entry as WantedFeed | null)?.url);
    const minutes = typeof entry === 'object' && entry !== null && Number.isFinite((entry as WantedFeed).minutes) ? (entry as WantedFeed).minutes : DEFAULT_MINUTES;
    if (url) entries.push({ url, minutes });
  }
  return mergeWanted(entries);
}

/**
 * The feeds used by the layout, mirrored into device-local storage by the new tab page.
 * The background worker reads this to know what to refresh, without loading the whole layout.
 */
export function createWantedFeeds(store: KeyValueStore = createDefaultStore()) {
  return {
    get: async () => sanitize(await store.get<unknown>(KEY)),
    /** Writes only when the list changed, so unrelated saves don't wake other listeners. */
    async set(entries: readonly WantedFeed[]) {
      const next = mergeWanted(entries);
      const current = sanitize(await store.get<unknown>(KEY));
      if (JSON.stringify(next) !== JSON.stringify(current)) await store.set(KEY, next);
    },
  };
}
