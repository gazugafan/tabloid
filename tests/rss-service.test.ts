import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createFeedCache } from '../utils/rss/cache';
import { DEFAULT_RSS_CONFIG, FEED_COLORS, ITEMS_RANGE, nextFeedColor, sanitizeRssConfig } from '../utils/rss/config';
import { isRssRequest } from '../utils/rss/messages';
import { collectFeedUrls, handleRssRequest } from '../utils/rss/service';
import { createWantedFeeds } from '../utils/rss/wanted';
import { memoryStore } from './helpers';

const widget = (type: string, config: Record<string, unknown>) => ({ id: type + Math.random(), dashboard: 'home', type, x: 0, y: 0, w: 4, h: 4, config });

describe('sanitizeRssConfig', () => {
  it('defaults to opening links in a new tab and refreshing every 30 minutes', () => {
    expect(DEFAULT_RSS_CONFIG).toMatchObject({ newTab: true, refreshMinutes: 30, refreshOnOpen: true });
    expect(sanitizeRssConfig({ mode: 'all-tabs' }).mode).toBe('all-tabs');
    expect(sanitizeRssConfig({ refreshOnOpen: false }).refreshOnOpen).toBe(false);
    expect(sanitizeRssConfig({ refreshMinutes: 60 }).refreshMinutes).toBe(60);
    expect(sanitizeRssConfig({ refreshMinutes: 61 }).refreshMinutes).toBe(30);
  });

  it('fills defaults for empty or junk config', () => {
    expect(sanitizeRssConfig(undefined)).toEqual(DEFAULT_RSS_CONFIG);
    expect(sanitizeRssConfig({ feeds: 'x', mode: 'grid', layout: 'wall', maxItems: 'many', showImage: 'yes' })).toEqual(DEFAULT_RSS_CONFIG);
  });

  it('keeps valid feeds, drops bad or duplicate urls, and assigns titles and colors', () => {
    const config = sanitizeRssConfig({
      feeds: [
        { url: 'https://a.test/feed', title: '  My A  ', color: '#AABBCC' },
        { url: 'https://a.test/feed', title: 'dup' },
        { url: 'javascript:alert(1)', title: 'bad' },
        { url: 'https://b.test/rss' },
        'nope',
      ],
      maxItems: 999,
    });
    expect(config.feeds).toEqual([
      { url: 'https://a.test/feed', title: 'My A', color: '#aabbcc' },
      { url: 'https://b.test/rss', title: 'b.test', color: FEED_COLORS[1] },
    ]);
    expect(config.maxItems).toBe(ITEMS_RANGE.max);
  });

  it('picks the next unused color', () => {
    expect(nextFeedColor([])).toBe(FEED_COLORS[0]);
    expect(nextFeedColor([{ url: 'x', title: 'x', color: FEED_COLORS[0] }])).toBe(FEED_COLORS[1]);
  });
});

describe('collectFeedUrls', () => {
  it('gathers each distinct feed from RSS widgets only', () => {
    const urls = collectFeedUrls([
      widget('rss', { feeds: [{ url: 'https://a.test/f' }, { url: 'https://b.test/f' }] }),
      widget('rss', { feeds: [{ url: 'https://a.test/f' }] }),
      widget('notes', { feeds: [{ url: 'https://c.test/f' }] }),
    ]);
    expect(urls).toEqual(['https://a.test/f', 'https://b.test/f']);
  });
});

describe('messages', () => {
  it('accepts only well-formed requests', () => {
    expect(isRssRequest({ type: 'rss:refresh', urls: ['https://a.test'] })).toBe(true);
    expect(isRssRequest({ type: 'rss:discover', input: 'a.test' })).toBe(false);
    expect(isRssRequest({ type: 'rss:refresh', urls: [1] })).toBe(false);
    expect(isRssRequest({ type: 'rss:refresh', urls: [], ttlMs: 15 * 60_000 })).toBe(true);
    expect(isRssRequest({ type: 'rss:refresh', urls: [], ttlMs: 5 })).toBe(false);
    expect(isRssRequest({ type: 'other' })).toBe(false);
    expect(isRssRequest(null)).toBe(false);
  });
});

describe('handleRssRequest', () => {
  it('refreshes valid feed urls into the cache and ignores unsafe ones', async () => {
    const cache = createFeedCache(memoryStore());
    const fetchFn = vi.fn(async () => new Response(readFileSync('tests/fixtures/rss/hn.xml'))) as unknown as typeof fetch;
    const result = await handleRssRequest({ type: 'rss:refresh', urls: ['https://news.ycombinator.com/rss', 'javascript:alert(1)'] }, { cache, fetchFn });
    expect(result).toEqual({ ok: true, data: null });
    expect(fetchFn).toHaveBeenCalledTimes(2); // The feed, then its site's home page for the icon.
    const feed = await cache.get('https://news.ycombinator.com/rss');
    expect(feed?.items.length).toBeGreaterThan(0);
    expect(feed?.iconUrl).toBeTruthy();
  });
});

describe('wanted feeds mirror', () => {
  it('stores one sorted entry per feed with the shortest interval, and skips writes when nothing changed', async () => {
    const store = memoryStore();
    const set = vi.spyOn(store, 'set');
    const wanted = createWantedFeeds(store);
    await wanted.set([{ url: 'https://b.test/', minutes: 60 }, { url: 'https://a.test/', minutes: 30 }, { url: 'https://b.test/', minutes: 15 }]);
    expect(await wanted.get()).toEqual([{ url: 'https://a.test/', minutes: 30 }, { url: 'https://b.test/', minutes: 15 }]);
    await wanted.set([{ url: 'https://a.test/', minutes: 30 }, { url: 'https://b.test/', minutes: 15 }]);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('still reads the older plain list of addresses, and ignores junk', async () => {
    const wanted = createWantedFeeds(memoryStore({ 'rss:wanted': ['https://a.test/', 'javascript:x', 5] }));
    expect(await wanted.get()).toEqual([{ url: 'https://a.test/', minutes: 30 }]);
  });
});

describe('collectWantedFeeds', () => {
  it('pairs each feed with its widget interval, using the shortest when widgets share a feed', async () => {
    const { collectWantedFeeds } = await import('../utils/rss/service');
    const wanted = collectWantedFeeds([
      widget('rss', { feeds: [{ url: 'https://a.test/f' }, { url: 'https://b.test/f' }], refreshMinutes: 120 }),
      widget('rss', { feeds: [{ url: 'https://a.test/f' }], refreshMinutes: 15 }),
      widget('rss', { feeds: [{ url: 'https://c.test/f' }], refreshMinutes: 7 }),
    ]);
    expect(wanted).toEqual([
      { url: 'https://a.test/f', minutes: 15 },
      { url: 'https://b.test/f', minutes: 120 },
      { url: 'https://c.test/f', minutes: 30 }, // 7 isn't an allowed choice: default.
    ]);
  });
});

describe('read state', () => {
  it('adds ids once, keeps order, and caps the list', async () => {
    const { markRead, MAX_READ_IDS, sanitizeReadState } = await import('../utils/rss/readState');
    const a = markRead({ ids: [] }, ['1', '2', '2']);
    expect(a.ids).toEqual(['1', '2']);
    expect(markRead(a, ['2'])).toBe(a);
    const big = markRead({ ids: [] }, Array.from({ length: MAX_READ_IDS + 5 }, (_, i) => String(i)));
    expect(big.ids).toHaveLength(MAX_READ_IDS);
    expect(big.ids.at(-1)).toBe(String(MAX_READ_IDS + 4));
    expect(sanitizeReadState({ ids: ['x', 3, null] })).toEqual({ ids: ['x'] });
    expect(sanitizeReadState('junk')).toEqual({ ids: [] });
  });
});

describe('merging items', () => {
  const ref = (url: string, title = url) => ({ url, title, color: '#000000' });
  const item = (feedUrl: string, id: string, link: string, published: number, title = id) => ({ id, feedUrl, title, link, summary: '', published });
  const cached = (url: string, ...items: ReturnType<typeof item>[]) => ({ url, title: url, fetchedAt: 1, items });

  it('sorts newest first and collapses the same article from different feeds', async () => {
    const { mergeFeeds, canonicalLink } = await import('../utils/rss/items');
    const a = ref('https://a.test/f');
    const b = ref('https://b.test/f');
    const map = new Map([
      [a.url, cached(a.url, item(a.url, 'a1', 'https://news.test/story?utm_source=x', 300), item(a.url, 'a2', 'https://news.test/old', 100))],
      [b.url, cached(b.url, item(b.url, 'b1', 'https://www.news.test/story/', 250), item(b.url, 'b2', 'https://news.test/mid', 200))],
    ]);
    const merged = mergeFeeds([a, b], map, 10);
    expect(merged.map((i) => i.id)).toEqual(['a1', 'b2', 'a2']);
    expect(merged[0]?.feed).toBe(a);
    expect(mergeFeeds([a, b], map, 2)).toHaveLength(2);
    expect(canonicalLink('https://www.x.test/a/?utm_medium=1&id=5#top')).toBe('https://x.test/a?id=5');
  });

  it('lists one feed alone and tolerates feeds that were never fetched', async () => {
    const { feedItems, mergeFeeds } = await import('../utils/rss/items');
    const a = ref('https://a.test/f');
    expect(feedItems(a, cached(a.url, item(a.url, '1', 'https://x.test/1', 1), item(a.url, '2', 'https://x.test/2', 2)), 1).map((i) => i.id)).toEqual(['2']);
    expect(feedItems(a, undefined, 5)).toEqual([]);
    expect(mergeFeeds([a], new Map(), 5)).toEqual([]);
  });

  it('describes times relative to now', async () => {
    const { timeAgo } = await import('../utils/rss/items');
    const now = Date.parse('2026-11-05T12:00:00Z');
    expect(timeAgo(now - 30e3, now, 'en')).toBe('now');
    expect(timeAgo(now - 5 * 60e3, now, 'en')).toMatch(/5 min/);
    expect(timeAgo(now - 3 * 3600e3, now, 'en')).toMatch(/3 hr/);
    expect(timeAgo(now - 24 * 3600e3, now, 'en')).toBe('yesterday');
  });
});
