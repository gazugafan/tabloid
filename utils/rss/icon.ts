import type { FetchFn } from '../sync/shared';
import { fetchFeedText } from './fetch';
import { safeUrl } from './text';

/** How long a found icon is trusted before we look again. */
export const ICON_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const WANTED_SIZE = 32;
const MAX_PAGE_BYTES = 1.5 * 1024 * 1024;

export const attributeOf = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined);

/**
 * The best icon a web page advertises (<link rel="icon" ...>): the smallest one that's still sharp
 * at small sizes, else the largest. Returns undefined if the page names none.
 */
export function findIconUrl(html: string, pageUrl: string): string | undefined {
  const candidates: Array<{ url: string; size: number }> = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attributeOf(match[0], 'rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue;
    const url = safeUrl(attributeOf(match[0], 'href'), pageUrl);
    if (!url) continue;
    const sizes = /(\d+)x\d+/i.exec(attributeOf(match[0], 'sizes') ?? '')?.[1];
    candidates.push({ url, size: sizes ? Number(sizes) : WANTED_SIZE });
  }
  if (candidates.length === 0) return undefined;
  const sharp = candidates.filter((c) => c.size >= WANTED_SIZE).sort((a, b) => a.size - b.size);
  return (sharp[0] ?? candidates.sort((a, b) => b.size - a.size)[0])!.url;
}

/** Looks at a site's home page for its icon, falling back to the conventional /favicon.ico. */
export async function fetchSiteIcon(siteUrl: string, options: { fetchFn?: FetchFn; timeoutMs?: number } = {}): Promise<string | undefined> {
  const fallback = safeUrl('/favicon.ico', siteUrl);
  try {
    const page = await fetchFeedText(siteUrl, {
      fetchFn: options.fetchFn,
      timeoutMs: options.timeoutMs ?? 8000,
      maxBytes: MAX_PAGE_BYTES,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    });
    return (page.status === 'ok' ? findIconUrl(page.text, siteUrl) : undefined) ?? fallback;
  } catch {
    return fallback;
  }
}
