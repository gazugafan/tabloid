import type { FetchFn } from '../sync/shared';
import type { FeedCache } from './cache';
import { fetchFeedText } from './fetch';
import { fetchSiteIcon, ICON_RECHECK_MS } from './icon';
import { parseFeed } from './parse';
import type { CachedFeed, FeedItem } from './types';

/** A cached feed counts as fresh this long. Alarms refresh feeds on this cadence too. */
export const FEED_TTL_MS = 30 * 60 * 1000;
/** After a failure, wait this long before trying again on our own (a manual refresh ignores it). */
export const RETRY_AFTER_ERROR_MS = 5 * 60 * 1000;
export const MAX_ITEMS_PER_FEED = 60;
const CONCURRENCY = 4;

export interface RefreshDeps {
  cache: FeedCache;
  fetchFn?: FetchFn;
  now?: () => number;
  timeoutMs?: number;
}

const byNewest = (a: FeedItem, b: FeedItem) => b.published - a.published;

/**
 * Brings one feed up to date in the cache and returns it. Never throws: a failure is recorded on
 * the cached feed (keeping the items from the last success) so the widget can show it.
 */
export async function refreshFeed(url: string, deps: RefreshDeps, options: { force?: boolean; ttlMs?: number } = {}): Promise<CachedFeed> {
  const now = deps.now?.() ?? Date.now();
  const existing = await deps.cache.get(url);

  if (!options.force && existing) {
    const fresh = existing.fetchedAt > 0 && !existing.error && now - existing.fetchedAt < (options.ttlMs ?? FEED_TTL_MS);
    const recentlyFailed = existing.error && now - existing.error.at < RETRY_AFTER_ERROR_MS;
    if (fresh || recentlyFailed) return existing;
  }

  try {
    // Validators only help if we still have the items they describe.
    const conditional = existing && existing.items.length > 0 && !existing.error ? existing : undefined;
    const fetched = await fetchFeedText(url, {
      fetchFn: deps.fetchFn,
      timeoutMs: deps.timeoutMs,
      etag: conditional?.etag,
      lastModified: conditional?.lastModified,
    });

    if (fetched.status === 'not-modified' && existing) {
      const unchanged: CachedFeed = { ...existing, fetchedAt: now, error: undefined };
      await deps.cache.put(unchanged);
      return unchanged;
    }
    if (fetched.status !== 'ok') throw new Error('The server said nothing changed, but there is nothing cached.');

    const parsed = parseFeed(fetched.text, url, now);
    const known = new Map((existing?.items ?? []).map((item) => [item.id, item]));
    // Items without a date were stamped "now"; keep the time we first saw them instead.
    const items = parsed.items
      .map((item) => (item.published === now && known.has(item.id) ? { ...item, published: known.get(item.id)!.published } : item))
      .sort(byNewest)
      .slice(0, MAX_ITEMS_PER_FEED);

    const updated: CachedFeed = {
      url,
      title: parsed.title,
      siteUrl: parsed.siteUrl,
      fetchedAt: now,
      items,
      etag: fetched.etag,
      lastModified: fetched.lastModified,
      iconUrl: existing?.iconUrl,
      iconCheckedAt: existing?.iconCheckedAt,
    };
    await deps.cache.put(updated);
    return updated;
  } catch (error) {
    const failed: CachedFeed = {
      url,
      title: existing?.title ?? new URL(url).hostname,
      siteUrl: existing?.siteUrl,
      fetchedAt: existing?.fetchedAt ?? 0,
      items: existing?.items ?? [],
      etag: existing?.etag,
      lastModified: existing?.lastModified,
      iconUrl: existing?.iconUrl,
      iconCheckedAt: existing?.iconCheckedAt,
      error: { message: error instanceof Error ? error.message : String(error), at: now },
    };
    await deps.cache.put(failed);
    return failed;
  }
}

/** Finds a feed's site icon if we haven't looked recently. Never throws. */
export async function refreshIcon(url: string, deps: RefreshDeps): Promise<void> {
  const now = deps.now?.() ?? Date.now();
  const feed = await deps.cache.get(url);
  if (!feed || feed.error || (feed.iconCheckedAt && now - feed.iconCheckedAt < ICON_RECHECK_MS)) return;
  const iconUrl = await fetchSiteIcon(feed.siteUrl ?? url, { fetchFn: deps.fetchFn, timeoutMs: deps.timeoutMs });
  // Re-read: the cache may have been refreshed while we looked.
  const latest = (await deps.cache.get(url)) ?? feed;
  await deps.cache.put({ ...latest, iconUrl, iconCheckedAt: now });
}

/** Refreshes many feeds a few at a time, then forgets cached feeds that are no longer wanted. */
export interface RefreshManyOptions {
  force?: boolean;
  prune?: boolean;
  /** Also look up each feed's site icon (at most weekly). */
  icons?: boolean;
  /** How long a cached feed counts as fresh: one value for all, or one per feed address. */
  ttlMs?: number | ((url: string) => number);
}

export async function refreshFeeds(urls: readonly string[], deps: RefreshDeps, options: RefreshManyOptions = {}): Promise<void> {
  const unique = [...new Set(urls)];
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++]!;
      await refreshFeed(url, deps, { force: options.force, ttlMs: typeof options.ttlMs === 'function' ? options.ttlMs(url) : options.ttlMs });
      if (options.icons) await refreshIcon(url, deps);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  if (options.prune) await deps.cache.prune(unique);
}
