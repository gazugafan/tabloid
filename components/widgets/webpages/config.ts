export const MAX_PAGES = 10;

export interface WebPage {
  id: string;
  /** What the user typed; see `pageAddress` for the address that is actually loaded. */
  url: string;
  /** Tab label. Empty means use the site's name. */
  title: string;
}

export interface WebpagesConfig {
  pages: WebPage[];
  /** Remove the headers sites use to refuse being framed, for this widget's pages (needs extra permission). */
  bypass: boolean;
}

export const DEFAULT_WEBPAGES_CONFIG: WebpagesConfig = { pages: [], bypass: false };

/** The web address to load for what the user typed ("example.com" becomes https://example.com/), or undefined if it isn't a usable http(s) address. */
export function pageAddress(input: string): string | undefined {
  const text = input.trim();
  if (!text) return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i.test(text) ? text : `https://${text}`);
    const web = url.protocol === 'https:' || url.protocol === 'http:';
    return web && (url.hostname.includes('.') || url.hostname === 'localhost') ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** The tab label: the chosen title, or the site's name. */
export function pageLabel(page: WebPage): string {
  if (page.title) return page.title;
  const address = pageAddress(page.url);
  return address ? new URL(address).hostname.replace(/^www\./, '') : 'Page';
}

export function sanitizeWebpagesConfig(raw: unknown): WebpagesConfig {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const pages: WebPage[] = [];
  if (Array.isArray(r.pages)) {
    for (const item of r.pages.slice(0, MAX_PAGES)) {
      if (typeof item !== 'object' || item === null) continue;
      const p = item as Record<string, unknown>;
      pages.push({
        id: typeof p.id === 'string' && p.id ? p.id.slice(0, 64) : crypto.randomUUID(),
        url: typeof p.url === 'string' ? p.url.trim().slice(0, 2000) : '',
        title: typeof p.title === 'string' ? p.title.trim().slice(0, 40) : '',
      });
    }
  }
  return { pages, bypass: r.bypass === true };
}

/** The pages that can actually be shown, with their addresses. */
export function usablePages(config: WebpagesConfig): Array<WebPage & { address: string }> {
  return config.pages.flatMap((page) => {
    const address = pageAddress(page.url);
    return address ? [{ ...page, address }] : [];
  });
}
