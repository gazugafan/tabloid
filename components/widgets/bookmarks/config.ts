import { shortHash } from '../../../utils/rss/text';

export interface BookmarkLink {
  id: string;
  title: string;
  url: string;
}

export type BookmarkLayout = 'small' | 'medium' | 'large' | 'list';

export const BOOKMARK_LAYOUTS: ReadonlyArray<{ value: BookmarkLayout; label: string }> = [
  { value: 'small', label: 'Small icons' },
  { value: 'medium', label: 'Medium icons' },
  { value: 'large', label: 'Large icons' },
  { value: 'list', label: 'List' },
];

/**
 * What a link's tile shows (not used by the list layout): the site's icon; the image the page offers
 * for sharing; or a screenshot taken when the user visits the page (falling back to the shared image).
 */
export type BookmarkDisplay = 'icon' | 'preview' | 'screenshot';

export interface BookmarksConfig {
  links: BookmarkLink[];
  layout: BookmarkLayout;
  display: BookmarkDisplay;
  /** Load each site's own icon (a request to that site); otherwise a lettered tile is shown. */
  siteIcons: boolean;
  newTab: boolean;
}

export const MAX_LINKS = 60;

export const DEFAULT_BOOKMARKS_CONFIG: BookmarksConfig = { links: [], layout: 'small', display: 'icon', siteIcons: true, newTab: false };

/** Accepts "example.com" as well as full addresses; only http(s) links are kept. */
export function normalizeLinkUrl(input: string): string | undefined {
  const text = input.trim();
  if (!text) return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const linkHost = (url: string) => new URL(url).hostname.replace(/^www\./, '');

/** The first letter shown on a link's tile. */
export const linkInitial = (link: BookmarkLink) => (link.title.trim() || linkHost(link.url)).charAt(0).toUpperCase();

/** A stable hue for a link's tile, so sites are easy to tell apart. */
export const linkHue = (url: string) => parseInt(shortHash(linkHost(url)).slice(0, 4), 16) % 360;

export const siteIconUrl = (url: string) => `${new URL(url).origin}/favicon.ico`;

export function sanitizeBookmarksConfig(raw: unknown): BookmarksConfig {
  const d = DEFAULT_BOOKMARKS_CONFIG;
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const links: BookmarkLink[] = [];
  const ids = new Set<string>();
  for (const entry of Array.isArray(r.links) ? r.links : []) {
    if (typeof entry !== 'object' || entry === null || links.length >= MAX_LINKS) continue;
    const link = entry as Record<string, unknown>;
    const url = typeof link.url === 'string' ? normalizeLinkUrl(link.url) : undefined;
    if (!url) continue;
    let id = typeof link.id === 'string' && link.id ? link.id.slice(0, 64) : crypto.randomUUID();
    if (ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    const title = typeof link.title === 'string' ? link.title.trim().slice(0, 60) : '';
    links.push({ id, title: title || linkHost(url), url });
  }
  return {
    links,
    // 'grid' was the only icon layout before sizes existed.
    layout: r.layout === 'grid' ? 'small' : BOOKMARK_LAYOUTS.some((l) => l.value === r.layout) ? (r.layout as BookmarkLayout) : d.layout,
    display: r.display === 'preview' || r.display === 'screenshot' ? r.display : d.display,
    siteIcons: typeof r.siteIcons === 'boolean' ? r.siteIcons : d.siteIcons,
    newTab: typeof r.newTab === 'boolean' ? r.newTab : d.newTab,
  };
}
