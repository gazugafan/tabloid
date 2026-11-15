/** One article from a feed, in the form we cache and render. Text fields are plain text, never HTML. */
export interface FeedItem {
  /** Stable across refreshes; also the key for read tracking. */
  id: string;
  feedUrl: string;
  title: string;
  /** Only ever an http(s) URL. */
  link: string;
  /** Plain-text excerpt, possibly empty. */
  summary: string;
  /** Only ever an http(s) URL. */
  image?: string;
  author?: string;
  /** Epoch ms. Items without a date use the time we first saw them. */
  published: number;
}

export interface ParsedFeed {
  title: string;
  /** The website the feed belongs to, when the feed says. */
  siteUrl?: string;
  items: FeedItem[];
}

export interface FeedError {
  message: string;
  /** Epoch ms of the failed attempt. */
  at: number;
}

/** What we keep per feed so the new tab renders instantly and works offline. */
export interface CachedFeed {
  url: string;
  title: string;
  siteUrl?: string;
  /** Epoch ms of the last successful fetch (or 304). 0 if never fetched. */
  fetchedAt: number;
  items: FeedItem[];
  etag?: string;
  lastModified?: string;
  /** The site's icon, found by looking at its home page. Shown instead of a color dot if the user prefers. */
  iconUrl?: string;
  /** Epoch ms of the last time we looked for the icon; it's rechecked about weekly. */
  iconCheckedAt?: number;
  /** Set when the most recent attempt failed; the items above are from the last success. */
  error?: FeedError;
}
