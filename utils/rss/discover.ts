import type { FetchFn } from '../sync/shared';
import { fetchFeedText } from './fetch';
import { tryParseFeed } from './parse';
import { decodeEntities, safeUrl } from './text';

export interface DiscoveredFeed {
  url: string;
  title: string;
  siteUrl?: string;
}

const COMMON_PATHS = ['/feed', '/feed/', '/rss', '/rss.xml', '/atom.xml', '/feed.xml', '/index.xml', '/feeds/posts/default'];
const MAX_CANDIDATES = 8;

/** Turns what a user typed into an http(s) URL: adds https:// and understands feed:// links. */
export function normalizeFeedInput(input: string): string {
  let text = input.trim().replace(/^feed:(\/\/)?/i, '');
  if (!text) throw new Error('Enter a feed or website address.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  const url = safeUrl(text);
  if (!url) throw new Error("That doesn't look like a web address.");
  return url;
}

/** Feed links advertised by an HTML page (<link rel="alternate" type="application/rss+xml" ...>). */
export function findFeedLinks(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const get = (name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined);
    if (!/\balternate\b/i.test(get('rel') ?? '')) continue;
    if (!/(rss|atom|rdf)\+xml|application\/xml|text\/xml/i.test(get('type') ?? '')) continue;
    const url = safeUrl(get('href'), pageUrl);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Finds the feed(s) behind an address that may be a feed URL or an ordinary web page.
 * Throws a readable error if nothing usable is found.
 */
export async function discoverFeeds(input: string, options: { fetchFn?: FetchFn; timeoutMs?: number } = {}): Promise<DiscoveredFeed[]> {
  const start = normalizeFeedInput(input);
  const fetchOptions = { fetchFn: options.fetchFn, timeoutMs: options.timeoutMs };

  const page = await fetchFeedText(start, fetchOptions);
  if (page.status !== 'ok') throw new Error('Unexpected response.');
  const direct = tryParseFeed(page.text, start);
  if (direct) return [{ url: start, title: direct.title, siteUrl: direct.siteUrl }];

  // An HTML page: follow the feed links it advertises; only if none work, guess common locations.
  const origin = new URL(start).origin;
  const advertised = findFeedLinks(page.text, start).slice(0, MAX_CANDIDATES);
  const guesses = COMMON_PATHS.map((path) => origin + path).filter((url) => !advertised.includes(url));

  const probe = async (candidate: string): Promise<DiscoveredFeed | null> => {
    try {
      const response = await fetchFeedText(candidate, { ...fetchOptions, timeoutMs: Math.min(options.timeoutMs ?? 15_000, 8_000) });
      const feed = response.status === 'ok' ? tryParseFeed(response.text, candidate) : null;
      return feed ? { url: candidate, title: decodeEntities(feed.title), siteUrl: feed.siteUrl } : null;
    } catch {
      return null; // Not a feed, or unreachable.
    }
  };

  const found: DiscoveredFeed[] = [];
  for (const candidate of advertised) {
    const feed = await probe(candidate);
    if (feed) found.push(feed);
  }
  for (const candidate of found.length === 0 ? guesses : []) {
    const feed = await probe(candidate);
    if (feed) {
      found.push(feed);
      break;
    }
  }
  if (found.length === 0) throw new Error("Couldn't find a feed at that address. Try the feed's own link.");
  return found;
}
