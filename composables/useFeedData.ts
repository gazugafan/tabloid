import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { createFeedCache, type FeedCache } from '../utils/rss/cache';
import { createFeedClient, type FeedClient } from '../utils/rss/client';
import { hasFeedAccess } from '../utils/rss/permissions';
import type { CachedFeed } from '../utils/rss/types';

/** Opening the page re-checks feeds unless they were checked this recently, so rapid tab opens stay cheap. */
export const OPEN_REFRESH_MIN_GAP_MS = 2 * 60_000;

/**
 * Cached feed data for a list of feed addresses. Renders what is already on the device right away,
 * then asks for a refresh (the cache's freshness rules decide whether anything is downloaded).
 */
export function useFeedData(
  urls: Ref<readonly string[]>,
  options: { cache?: FeedCache; client?: FeedClient; refreshMinutes?: Ref<number>; refreshOnOpen?: Ref<boolean> } = {},
) {
  const deps = options;
  const cache = deps.cache ?? createFeedCache();
  const client = deps.client ?? createFeedClient();

  const feeds = shallowRef<ReadonlyMap<string, CachedFeed>>(new Map());
  const refreshing = ref(false);
  /** Feeds are configured but this device hasn't granted access to fetch them (e.g. synced from elsewhere). */
  const needsAccess = ref(false);
  const refreshFailure = ref<string | null>(null);
  let disposed = false;

  async function loadCache() {
    const loaded = await cache.getMany(urls.value);
    if (!disposed) feeds.value = loaded;
  }

  /** `only` limits the refresh to some of the feeds. */
  async function refresh(force = false, only: readonly string[] = urls.value, ttlMs?: number) {
    if (urls.value.length === 0 || only.length === 0) return;
    needsAccess.value = !(await hasFeedAccess());
    if (needsAccess.value) return;
    refreshing.value = true;
    refreshFailure.value = null;
    try {
      await client.refresh(only, { force, ttlMs: ttlMs ?? (options.refreshMinutes ? options.refreshMinutes.value * 60_000 : undefined) });
    } catch (error) {
      refreshFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
      refreshing.value = false;
      await loadCache();
    }
  }

  let debounce: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;

  onMounted(async () => {
    await loadCache();
    // The background worker writes the cache too; pick up its changes (and other tabs') as they land.
    stop = cache.subscribe(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void loadCache(), 100);
    });
    // Opening the page checks every feed (unless checked in the last couple of minutes) unless the user
    // turned that off; feeds we have nothing cached for are always fetched, or the widget would stay
    // empty until the next background run.
    const uncached = urls.value.filter((url) => !feeds.value.has(url));
    if (options.refreshOnOpen?.value === false) void refresh(false, uncached);
    else void refresh(false, urls.value, OPEN_REFRESH_MIN_GAP_MS);
  });
  onBeforeUnmount(() => {
    disposed = true;
    clearTimeout(debounce);
    stop?.();
  });

  // Feeds added or removed: show what is cached for the new set, then fetch what's missing.
  watch(
    () => urls.value.join('\n'),
    async () => {
      await loadCache();
      void refresh();
    },
  );

  return { feeds, refreshing, needsAccess, refreshFailure, refresh, reload: loadCache };
}
