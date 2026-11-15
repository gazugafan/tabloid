import { fetchFeedText } from '../../../utils/rss/fetch';
import { attributeOf } from '../../../utils/rss/icon';
import { safeUrl, shortHash } from '../../../utils/rss/text';
import { createLimiter } from '../../../utils/rss/thumbnails';
import { createDefaultStore, type KeyValueStore } from '../../../utils/storage/store';

/** A page with no preview image is looked at again after this long; one with an image, after a month. */
export const PREVIEW_RETRY_MS = 24 * 60 * 60 * 1000;
export const PREVIEW_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PAGE_BYTES = 1.5 * 1024 * 1024;

const IMAGE_NAMES = ['og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src'];

/** The image a page offers for sharing (Open Graph or Twitter card), as an absolute web address. */
export function findPreviewImage(html: string, pageUrl: string): string | undefined {
  const found = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = (attributeOf(match[0], 'property') ?? attributeOf(match[0], 'name') ?? '').toLowerCase();
    const content = attributeOf(match[0], 'content');
    if (IMAGE_NAMES.includes(name) && content && !found.has(name)) found.set(name, content);
  }
  for (const name of IMAGE_NAMES) {
    const url = safeUrl(found.get(name), pageUrl);
    if (url) return url;
  }
  return undefined;
}

interface CachedPreview {
  checkedAt: number;
  image?: string;
}

export interface PreviewDeps {
  store?: KeyValueStore;
  fetchHtml?: (url: string) => Promise<string | undefined>;
  now?: () => number;
}

async function fetchHtml(url: string): Promise<string | undefined> {
  const page = await fetchFeedText(url, { timeoutMs: 8000, maxBytes: MAX_PAGE_BYTES, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' });
  return page.status === 'ok' ? page.text : undefined;
}

const limit = createLimiter(3);
const inFlight = new Map<string, Promise<string | undefined>>();

/**
 * The preview image for a link: from the device cache, else found on the page and remembered.
 * Never throws; undefined means "none" (the caller shows the icon instead).
 */
export function loadPreviewImage(url: string, deps: PreviewDeps = {}): Promise<string | undefined> {
  const existing = inFlight.get(url);
  if (existing) return existing;
  const promise = (async () => {
    const store = deps.store ?? createDefaultStore();
    const now = (deps.now ?? Date.now)();
    const key = `bookmarks:preview:${shortHash(url)}${shortHash([...url].reverse().join(''))}`;
    const cached = await store.get<CachedPreview>(key).catch(() => undefined);
    if (cached && now - cached.checkedAt < (cached.image ? PREVIEW_RECHECK_MS : PREVIEW_RETRY_MS)) return cached.image;
    let image: string | undefined;
    try {
      const html = await limit(() => (deps.fetchHtml ?? fetchHtml)(url));
      if (html === undefined) return cached?.image; // Offline or blocked: keep what we had, ask again next time.
      image = findPreviewImage(html, url);
    } catch {
      return cached?.image;
    }
    await store.set(key, { checkedAt: now, image } satisfies CachedPreview).catch(() => undefined);
    return image;
  })();
  inFlight.set(url, promise);
  void promise.finally(() => inFlight.delete(url));
  return promise;
}
