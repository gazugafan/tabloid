import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createFeedCache } from '../utils/rss/cache';
import { discoverFeeds, findFeedLinks, normalizeFeedInput } from '../utils/rss/discover';
import { decodeFeedBytes, detectEncoding, fetchFeedText } from '../utils/rss/fetch';
import { FEED_TTL_MS, MAX_ITEMS_PER_FEED, refreshFeed, refreshFeeds, RETRY_AFTER_ERROR_MS } from '../utils/rss/refresh';
import { memoryStore } from './helpers';

const bytes = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/rss/${name}`));
const respond = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body, init);

/** A fake web: url -> response factory. Records requests. */
function web(routes: Record<string, () => Response>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    const route = routes[String(url)];
    return route ? route() : respond('nope', { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe('encoding', () => {
  it('uses the header charset, then the XML declaration, then UTF-8', () => {
    const latin = bytes('slashdot-rdf.xml');
    expect(detectEncoding(latin, 'text/xml')).toBe('ISO-8859-1');
    expect(detectEncoding(latin, 'text/xml; charset=windows-1252')).toBe('windows-1252');
    expect(detectEncoding(new TextEncoder().encode('<rss/>'), null)).toBe('utf-8');
  });

  it('decodes ISO-8859-1 feeds correctly and survives unknown encodings', () => {
    const text = decodeFeedBytes(new Uint8Array([0x3c, 0x61, 0x3e, 0xe9, 0x3c, 0x2f, 0x61, 0x3e]), 'text/xml; charset=iso-8859-1');
    expect(text).toBe('<a>é</a>');
    expect(decodeFeedBytes(new TextEncoder().encode('ok'), 'text/xml; charset=bogus-9')).toBe('ok');
  });
});

describe('fetchFeedText', () => {
  const url = 'https://a.test/feed';

  it('sends validators and reports 304', async () => {
    const { calls, fetchFn } = web({ [url]: () => respond(null, { status: 304 }) });
    expect(await fetchFeedText(url, { fetchFn, etag: '"x"', lastModified: 'Mon' })).toEqual({ status: 'not-modified' });
    expect(calls[0]?.headers['If-None-Match']).toBe('"x"');
    expect(calls[0]?.headers['If-Modified-Since']).toBe('Mon');
  });

  it('explains common failures', async () => {
    for (const [status, pattern] of [[404, /wasn't found/], [403, /wouldn't let/], [429, /limiting/], [503, /server problem/]] as const) {
      const { fetchFn } = web({ [url]: () => respond('', { status }) });
      await expect(fetchFeedText(url, { fetchFn })).rejects.toThrow(pattern);
    }
    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(fetchFeedText(url, { fetchFn: offline })).rejects.toThrow(/Couldn't reach a\.test/);
  });

  it('gives up on slow servers and huge feeds', async () => {
    const slow = vi.fn((_: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    await expect(fetchFeedText(url, { fetchFn: slow, timeoutMs: 20 })).rejects.toThrow(/took too long/);
    const { fetchFn } = web({ [url]: () => respond('x'.repeat(2000)) });
    await expect(fetchFeedText(url, { fetchFn, maxBytes: 1000 })).rejects.toThrow(/too large/);
  });
});

describe('refreshFeed', () => {
  const url = 'https://feeds.bbci.co.uk/news/rss.xml';
  const feedResponse = () => respond(bytes('bbc.xml'), { headers: { etag: '"v1"', 'content-type': 'text/xml' } });

  it('fetches, parses and caches, then reuses the cache while fresh', async () => {
    const cache = createFeedCache(memoryStore());
    const { fetchFn } = web({ [url]: feedResponse });
    const first = await refreshFeed(url, { cache, fetchFn, now: () => 1000 });
    expect(first.items.length).toBeGreaterThan(0);
    expect(first.etag).toBe('"v1"');
    await refreshFeed(url, { cache, fetchFn, now: () => 1000 + FEED_TTL_MS - 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await refreshFeed(url, { cache, fetchFn, now: () => 1000 + FEED_TTL_MS });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('honors a custom freshness window', async () => {
    const cache = createFeedCache(memoryStore());
    const { fetchFn } = web({ [url]: feedResponse });
    const hour = 60 * 60 * 1000;
    await refreshFeed(url, { cache, fetchFn, now: () => 1000 }, { ttlMs: hour });
    await refreshFeed(url, { cache, fetchFn, now: () => 1000 + hour - 1 }, { ttlMs: hour });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await refreshFeed(url, { cache, fetchFn, now: () => 1000 + hour }, { ttlMs: hour });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('applies a per-feed freshness window when refreshing many', async () => {
    const cache = createFeedCache(memoryStore());
    const { fetchFn } = web({ [url]: feedResponse, 'https://news.ycombinator.com/rss': () => respond(bytes('hn.xml')) });
    const ttl = (u: string) => (u === url ? 10 * 60_000 : 60 * 60_000);
    await refreshFeeds([url, 'https://news.ycombinator.com/rss'], { cache, fetchFn, now: () => 1000 }, { ttlMs: ttl });
    await refreshFeeds([url, 'https://news.ycombinator.com/rss'], { cache, fetchFn, now: () => 1000 + 20 * 60_000 }, { ttlMs: ttl });
    expect(fetchFn).toHaveBeenCalledTimes(3); // Only the 10-minute feed was fetched again.
  });

  it('sends the etag again and keeps items on 304', async () => {
    const cache = createFeedCache(memoryStore());
    let respondWith: () => Response = feedResponse;
    const { calls, fetchFn } = web({ [url]: () => respondWith() });
    const first = await refreshFeed(url, { cache, fetchFn, now: () => 1 });
    respondWith = () => respond(null, { status: 304 });
    const second = await refreshFeed(url, { cache, fetchFn, now: () => 1 + FEED_TTL_MS }, {});
    expect(calls[1]?.headers['If-None-Match']).toBe('"v1"');
    expect(second.items).toEqual(first.items);
    expect(second.fetchedAt).toBe(1 + FEED_TTL_MS);
  });

  it('records failures but keeps the last good items, and backs off', async () => {
    const cache = createFeedCache(memoryStore());
    let respondWith: () => Response = feedResponse;
    const { fetchFn } = web({ [url]: () => respondWith() });
    const good = await refreshFeed(url, { cache, fetchFn, now: () => 1 });
    respondWith = () => respond('', { status: 503 });
    const t = 1 + FEED_TTL_MS;
    const failed = await refreshFeed(url, { cache, fetchFn, now: () => t });
    expect(failed.error?.message).toMatch(/server problem/);
    expect(failed.items).toEqual(good.items);
    expect(failed.fetchedAt).toBe(1);
    await refreshFeed(url, { cache, fetchFn, now: () => t + RETRY_AFTER_ERROR_MS - 1 });
    expect(fetchFn).toHaveBeenCalledTimes(2); // Backed off.
    respondWith = feedResponse;
    const forced = await refreshFeed(url, { cache, fetchFn, now: () => t + 1 }, { force: true });
    expect(forced.error).toBeUndefined();
  });

  it('reports pages that are not feeds without breaking', async () => {
    const cache = createFeedCache(memoryStore());
    const { fetchFn } = web({ [url]: () => respond('<html><body>hi</body></html>') });
    const result = await refreshFeed(url, { cache, fetchFn, now: () => 1 });
    expect(result.error?.message).toMatch(/doesn't look like/);
    expect(result.items).toEqual([]);
  });

  it('keeps the first-seen time of undated items and caps the item count', async () => {
    const many = Array.from({ length: MAX_ITEMS_PER_FEED + 10 }, (_, i) => `<item><title>T${i}</title><link>https://s.test/${i}</link><pubDate>${new Date(1e12 + i * 1000).toUTCString()}</pubDate></item>`).join('');
    const undated = '<item><title>Undated</title><link>https://s.test/u</link></item>';
    const wrap = (items: string) => `<rss version="2.0"><channel><title>S</title>${items}</channel></rss>`;
    const cache = createFeedCache(memoryStore());
    let body = wrap(undated);
    const { fetchFn } = web({ 'https://s.test/feed': () => respond(body) });
    const first = await refreshFeed('https://s.test/feed', { cache, fetchFn, now: () => 5000 });
    body = wrap(undated);
    const second = await refreshFeed('https://s.test/feed', { cache, fetchFn, now: () => 5000 + FEED_TTL_MS });
    expect(first.items[0]?.published).toBe(5000);
    expect(second.items[0]?.published).toBe(5000);
    body = wrap(many);
    const third = await refreshFeed('https://s.test/feed', { cache, fetchFn, now: () => 5000 + 2 * FEED_TTL_MS }, { force: true });
    expect(third.items).toHaveLength(MAX_ITEMS_PER_FEED);
    expect(third.items[0]?.published).toBeGreaterThan(third.items[1]!.published);
  });

  it('refreshFeeds refreshes each url once and prunes unused cache entries', async () => {
    const store = memoryStore();
    const cache = createFeedCache(store);
    const { fetchFn } = web({ [url]: feedResponse, 'https://news.ycombinator.com/rss': () => respond(bytes('hn.xml')) });
    await refreshFeeds([url, 'https://news.ycombinator.com/rss', url], { cache, fetchFn, now: () => 1 }, { prune: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await refreshFeeds([url], { cache, fetchFn, now: () => 2 }, { prune: true });
    expect(await cache.get('https://news.ycombinator.com/rss')).toBeUndefined();
    expect(await cache.get(url)).toBeDefined();
  });
});

describe('discovery', () => {
  it('normalizes what people type', () => {
    expect(normalizeFeedInput(' example.com/blog ')).toBe('https://example.com/blog');
    expect(normalizeFeedInput('feed://example.com/rss')).toBe('https://example.com/rss');
    expect(normalizeFeedInput('http://example.com')).toBe('http://example.com/');
    expect(() => normalizeFeedInput('  ')).toThrow(/Enter/);
    expect(() => normalizeFeedInput('javascript:alert(1)')).toThrow();
  });

  it('finds advertised feed links in any attribute order and quoting', () => {
    const html = `<head>
      <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
      <link href='https://other.test/atom' type='application/atom+xml' rel='alternate'>
      <link rel="stylesheet" href="/a.css"><link rel="alternate" type="text/html" href="/fr">
      <link rel="alternate" type="application/rss+xml" href="javascript:alert(1)"></head>`;
    expect(findFeedLinks(html, 'https://site.test/blog/')).toEqual(['https://site.test/feed.xml', 'https://other.test/atom']);
  });

  it('returns a feed URL directly with its title', async () => {
    const { fetchFn } = web({ 'https://news.ycombinator.com/rss': () => respond(bytes('hn.xml')) });
    expect(await discoverFeeds('news.ycombinator.com/rss', { fetchFn })).toEqual([
      { url: 'https://news.ycombinator.com/rss', title: 'Hacker News', siteUrl: 'https://news.ycombinator.com/' },
    ]);
  });

  it('follows the link advertised by a web page', async () => {
    const page = '<html><head><link rel="alternate" type="application/atom+xml" href="/atom.xml"></head></html>';
    const { fetchFn } = web({ 'https://xkcd.test/': () => respond(page), 'https://xkcd.test/atom.xml': () => respond(bytes('xkcd-atom.xml')) });
    const found = await discoverFeeds('xkcd.test', { fetchFn });
    expect(found.map((f) => f.url)).toEqual(['https://xkcd.test/atom.xml']);
  });

  it('guesses common paths when the page advertises nothing, and fails clearly otherwise', async () => {
    const guess = web({ 'https://blog.test/': () => respond('<html></html>'), 'https://blog.test/rss.xml': () => respond(bytes('hn.xml')) });
    expect((await discoverFeeds('blog.test', { fetchFn: guess.fetchFn })).map((f) => f.url)).toEqual(['https://blog.test/rss.xml']);
    const none = web({ 'https://plain.test/': () => respond('<html></html>') });
    await expect(discoverFeeds('plain.test', { fetchFn: none.fetchFn })).rejects.toThrow(/Couldn't find a feed/);
  });
});

describe('site icons', () => {
  const page = (links: string) => `<html><head>${links}</head></html>`;

  it('picks the smallest icon that is still sharp, resolving relative addresses', async () => {
    const { findIconUrl } = await import('../utils/rss/icon');
    const html = page(`
      <link rel="icon" href="/tiny.png" sizes="16x16">
      <link rel="shortcut icon" href="/mid.png" sizes="48x48">
      <link rel="apple-touch-icon" href="/big.png" sizes="180x180">
      <link rel="mask-icon" href="/mask.svg">
      <link rel="stylesheet" href="/a.css">`);
    expect(findIconUrl(html, 'https://site.test/blog/')).toBe('https://site.test/mid.png');
    expect(findIconUrl(page('<link rel="icon" href="/only-small.png" sizes="16x16"><link rel="icon" href="/bit-bigger.png" sizes="24x24">'), 'https://site.test/')).toBe('https://site.test/bit-bigger.png');
    expect(findIconUrl(page('<link rel="icon" href="javascript:x">'), 'https://site.test/')).toBeUndefined();
    expect(findIconUrl(page(''), 'https://site.test/')).toBeUndefined();
  });

  it('reads the home page, and falls back to /favicon.ico when that fails', async () => {
    const { fetchSiteIcon } = await import('../utils/rss/icon');
    const ok = web({ 'https://site.test/': () => respond(page('<link rel="icon" href="/i.png">')) });
    expect(await fetchSiteIcon('https://site.test/', { fetchFn: ok.fetchFn })).toBe('https://site.test/i.png');
    const none = web({ 'https://site.test/': () => respond(page('')) });
    expect(await fetchSiteIcon('https://site.test/', { fetchFn: none.fetchFn })).toBe('https://site.test/favicon.ico');
    const down = web({});
    expect(await fetchSiteIcon('https://site.test/', { fetchFn: down.fetchFn })).toBe('https://site.test/favicon.ico');
  });

  it('refreshFeeds looks up icons only when asked, and only about once a week', async () => {
    const { ICON_RECHECK_MS } = await import('../utils/rss/icon');
    const feedUrl = 'https://news.ycombinator.com/rss';
    const cache = createFeedCache(memoryStore());
    const routes = { [feedUrl]: () => respond(bytes('hn.xml')), 'https://news.ycombinator.com/': () => respond(page('<link rel="icon" href="/y18.svg">')) };
    const { calls, fetchFn } = web(routes);
    await refreshFeeds([feedUrl], { cache, fetchFn, now: () => 1000 });
    expect(calls.map((c) => c.url)).toEqual([feedUrl]);
    expect((await cache.get(feedUrl))?.iconUrl).toBeUndefined();

    await refreshFeeds([feedUrl], { cache, fetchFn, now: () => 1000 }, { icons: true, force: true });
    expect((await cache.get(feedUrl))?.iconUrl).toBe('https://news.ycombinator.com/y18.svg');
    const before = calls.length;
    await refreshFeeds([feedUrl], { cache, fetchFn, now: () => 2000 }, { icons: true, force: true });
    expect(calls.slice(before).map((c) => c.url)).toEqual([feedUrl]); // Feed fetched again, home page not.
    await refreshFeeds([feedUrl], { cache, fetchFn, now: () => 2000 + ICON_RECHECK_MS }, { icons: true, force: true });
    expect(calls.at(-1)?.url).toBe('https://news.ycombinator.com/');
  });
});
