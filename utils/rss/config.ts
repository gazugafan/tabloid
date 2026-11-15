import { safeUrl } from './text';

export type RssLayout = 'compact' | 'thumbnails' | 'cards';
/** One merged list; one tab per feed; or an "All" tab followed by one tab per feed. */
export type RssMode = 'merged' | 'tabs' | 'all-tabs';

export const RSS_MODES: ReadonlyArray<{ value: RssMode; label: string }> = [
  { value: 'merged', label: 'Merged into one list' },
  { value: 'tabs', label: 'In tabs, one per feed' },
  { value: 'all-tabs', label: 'In tabs, with an All tab first' },
];

export const RSS_LAYOUTS: ReadonlyArray<{ value: RssLayout; label: string }> = [
  { value: 'compact', label: 'Compact list' },
  { value: 'thumbnails', label: 'List with thumbnails' },
  { value: 'cards', label: 'Image cards' },
];

/** Colors handed out to feeds in turn, so sources are easy to tell apart. */
export const FEED_COLORS = ['#e5484d', '#f76b15', '#f5b800', '#30a46c', '#12a594', '#0091ff', '#6e56cf', '#d6409f', '#8d6e63', '#607d8b'] as const;

/** How often a widget's feeds are refreshed in the background. */
export const REFRESH_CHOICES: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every hour' },
  { minutes: 120, label: 'Every 2 hours' },
  { minutes: 360, label: 'Every 6 hours' },
  { minutes: 720, label: 'Every 12 hours' },
];

export type FeedMarker = 'dot' | 'icon';

export const MAX_FEEDS_PER_WIDGET = 40;
export const MAX_TITLE_LENGTH = 60;
export const ITEMS_RANGE = { min: 3, max: 50 } as const;

export interface RssFeedRef {
  url: string;
  /** What the user calls it; starts as the feed's own title. */
  title: string;
  color: string;
}

export interface RssConfig {
  /** Optional heading shown above the feeds; empty means no heading (and no space for one). */
  title: string;
  feeds: RssFeedRef[];
  mode: RssMode;
  layout: RssLayout;
  /** Items shown at first; more appear as the list is scrolled. */
  maxItems: number;
  /** Background refresh interval in minutes (one of REFRESH_CHOICES). */
  refreshMinutes: number;
  /** Also check for new articles whenever the page opens (otherwise only in the background). */
  refreshOnOpen: boolean;
  showImage: boolean;
  showSummary: boolean;
  showSource: boolean;
  showTime: boolean;
  /** Open articles in a new tab instead of this one. */
  newTab: boolean;
  /** How a feed is marked next to its articles and on its tab. */
  feedMarker: FeedMarker;
}

export const DEFAULT_RSS_CONFIG: RssConfig = {
  title: '',
  feeds: [],
  mode: 'merged',
  layout: 'thumbnails',
  maxItems: 15,
  refreshMinutes: 30,
  refreshOnOpen: true,
  showImage: true,
  showSummary: true,
  showSource: true,
  showTime: true,
  newTab: true,
  feedMarker: 'icon',
};

const HEX = /^#[0-9a-f]{6}$/i;
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** Turns stored (possibly old, edited or imported) config into a valid RssConfig. */
export function sanitizeRssConfig(raw: unknown): RssConfig {
  const d = DEFAULT_RSS_CONFIG;
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const feeds: RssFeedRef[] = [];
  for (const entry of Array.isArray(r.feeds) ? r.feeds : []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const feed = entry as Record<string, unknown>;
    const url = typeof feed.url === 'string' ? safeUrl(feed.url) : undefined;
    if (!url || seen.has(url) || feeds.length >= MAX_FEEDS_PER_WIDGET) continue;
    seen.add(url);
    feeds.push({
      url,
      title: typeof feed.title === 'string' && feed.title.trim() ? feed.title.trim().slice(0, 100) : new URL(url).hostname,
      color: typeof feed.color === 'string' && HEX.test(feed.color) ? feed.color.toLowerCase() : FEED_COLORS[feeds.length % FEED_COLORS.length]!,
    });
  }
  const items = typeof r.maxItems === 'number' && Number.isFinite(r.maxItems) ? r.maxItems : d.maxItems;
  return {
    title: typeof r.title === 'string' ? r.title.trim().slice(0, MAX_TITLE_LENGTH) : d.title,
    feeds,
    mode: RSS_MODES.some((m) => m.value === r.mode) ? (r.mode as RssMode) : d.mode,
    layout: RSS_LAYOUTS.some((l) => l.value === r.layout) ? (r.layout as RssLayout) : d.layout,
    refreshMinutes: REFRESH_CHOICES.some((c) => c.minutes === r.refreshMinutes) ? (r.refreshMinutes as number) : d.refreshMinutes,
    maxItems: Math.round(Math.min(ITEMS_RANGE.max, Math.max(ITEMS_RANGE.min, items))),
    refreshOnOpen: bool(r.refreshOnOpen, d.refreshOnOpen),
    showImage: bool(r.showImage, d.showImage),
    showSummary: bool(r.showSummary, d.showSummary),
    showSource: bool(r.showSource, d.showSource),
    showTime: bool(r.showTime, d.showTime),
    newTab: bool(r.newTab, d.newTab),
    feedMarker: r.feedMarker === 'icon' || r.feedMarker === 'dot' ? r.feedMarker : d.feedMarker,
  };
}

/** The next unused palette color for a new feed. */
export function nextFeedColor(feeds: readonly RssFeedRef[]): string {
  const used = new Set(feeds.map((f) => f.color));
  return FEED_COLORS.find((c) => !used.has(c)) ?? FEED_COLORS[feeds.length % FEED_COLORS.length]!;
}
