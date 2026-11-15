import type { RssFeedRef } from './config';
import type { CachedFeed, FeedItem } from './types';

/** An item together with the feed reference (title, color) it should be shown under. */
export interface DisplayItem extends FeedItem {
  feed: RssFeedRef;
  /** The feed's site icon, if one was found. */
  icon?: string;
}

/** The address with tracking noise removed, so the same article from two feeds compares equal. */
export function canonicalLink(link: string): string {
  try {
    const url = new URL(link);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|ref$|cmp$|ocid$|at_)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.replace(/^www\./, '');
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase();
  } catch {
    return link;
  }
}

const newestFirst = (a: DisplayItem, b: DisplayItem) => b.published - a.published || a.title.localeCompare(b.title);

function itemsOf(feed: RssFeedRef, cached: CachedFeed | undefined): DisplayItem[] {
  return (cached?.items ?? []).map((item) => ({ ...item, feed, icon: cached?.iconUrl }));
}

/** All feeds merged into one list, newest first, with duplicate articles collapsed. */
export function mergeFeeds(refs: readonly RssFeedRef[], cached: ReadonlyMap<string, CachedFeed>, limit: number): DisplayItem[] {
  const seen = new Set<string>();
  const merged: DisplayItem[] = [];
  for (const item of refs.flatMap((ref) => itemsOf(ref, cached.get(ref.url))).sort(newestFirst)) {
    const key = canonicalLink(item.link);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

/** One feed's own items, newest first. */
export function feedItems(ref: RssFeedRef, cached: CachedFeed | undefined, limit: number): DisplayItem[] {
  return itemsOf(ref, cached).sort(newestFirst).slice(0, limit);
}

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600e3], ['month', 30 * 24 * 3600e3], ['week', 7 * 24 * 3600e3],
  ['day', 24 * 3600e3], ['hour', 3600e3], ['minute', 60e3],
];

/** "5 min. ago", "yesterday"... in the user's language. */
export function timeAgo(time: number, now: number = Date.now(), locale?: string): string {
  const diff = time - now;
  if (Math.abs(diff) < 60e3) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second');
  const [unit, size] = UNITS.find(([, ms]) => Math.abs(diff) >= ms) ?? UNITS[UNITS.length - 1]!;
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(Math.round(diff / size), unit);
}
