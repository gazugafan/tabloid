import { sanitizeAppearance, type Appearance } from '../appearance';
import { DEFAULT_BACKGROUND, sanitizeBackground, type BackgroundSettings } from '../background/settings';
import { DEFAULT_RSS_CONFIG, nextFeedColor, sanitizeRssConfig, type RssFeedRef } from '../rss/config';
import { DEFAULT_BOOKMARKS_CONFIG } from '../../components/widgets/bookmarks/config';
import { DEFAULT_SEARCH_CONFIG } from '../../components/widgets/search/config';
import { DEFAULT_TODO_CONFIG } from '../../components/widgets/todo/config';
import { DEFAULT_WEATHER_CONFIG } from '../../components/widgets/weather/config';
import type { WidgetConfig } from '../../types/layout';
import { arrangeStarterWidgets, type Want } from './layout';
import { QUICK_SITES, topicFeeds, TOPICS, type OnboardingChoices, type StarterWidget } from './choices';

export interface PlannedWidget {
  type: string;
  w: number;
  h: number;
  /** Where it goes, counted from the top left of the new set of widgets. */
  x: number;
  y: number;
  /** Shown straight on the page, with no card. */
  transparent?: boolean;
  config: WidgetConfig;
}

export interface OnboardingPlan {
  appearance: Appearance;
  background: BackgroundSettings;
  widgets: PlannedWidget[];
}

/** What each starter widget would like on the 12-column grid; the arranger stretches them to fill their rows. */
const WANTS: Record<StarterWidget, Want> = {
  search: { w: 8, h: 2, solo: 8 },
  clock: { w: 4, h: 2, solo: 4 },
  weather: { w: 3, h: 5, solo: 4 },
  bookmarks: { w: 6, h: 4, solo: 8 },
  todo: { w: 4, h: 5, solo: 6 },
  notes: { w: 4, h: 5, solo: 6 },
};
const TOP: StarterWidget[] = ['search', 'clock'];
const ORDER: StarterWidget[] = ['search', 'clock', 'weather', 'bookmarks', 'todo', 'notes'];
const NEWS_WANT: Want = { w: 4, h: 9, solo: 8 };

function widgetConfig(type: StarterWidget, choices: OnboardingChoices): WidgetConfig {
  switch (type) {
    case 'search':
      return { ...DEFAULT_SEARCH_CONFIG };
    case 'weather':
      return { ...DEFAULT_WEATHER_CONFIG, place: choices.place };
    case 'bookmarks': {
      const links = QUICK_SITES.filter((s) => choices.sites.includes(s.id)).map((s) => ({ id: crypto.randomUUID(), title: s.title, url: s.url }));
      return { ...DEFAULT_BOOKMARKS_CONFIG, links, layout: 'medium' };
    }
    case 'todo':
      return { ...DEFAULT_TODO_CONFIG };
    case 'notes':
      return { text: '' };
    default:
      return {};
  }
}

/** One news widget per topic, named after it, holding that topic's best-known feeds. */
function newsWidget(topicId: string): PlannedWidget | undefined {
  const feeds: RssFeedRef[] = [];
  for (const feed of topicFeeds(topicId)) feeds.push({ url: feed.url, title: feed.title, color: nextFeedColor(feeds) });
  if (feeds.length === 0) return undefined;
  const title = TOPICS.find((t) => t.id === topicId)?.id ?? topicId;
  return { type: 'rss', ...NEWS_WANT, x: 0, y: 0, config: sanitizeRssConfig({ ...DEFAULT_RSS_CONFIG, title, feeds, maxItems: 10 }) as unknown as WidgetConfig };
}

/** Turns what the user picked into appearance, background and widgets. Pure: nothing is saved here. */
export function buildPlan(choices: OnboardingChoices, current: { appearance?: unknown; background?: unknown } = {}): OnboardingPlan {
  const appearance = { ...sanitizeAppearance(current.appearance), mode: choices.mode, accent: choices.accent };
  const background: BackgroundSettings = {
    ...sanitizeBackground(current.background ?? DEFAULT_BACKGROUND),
    bing: choices.background === 'bing',
    wikimedia: choices.background === 'wikimedia',
    // Plain means no pictures at all, including any uploaded earlier.
    uploads: choices.background === 'plain' ? false : sanitizeBackground(current.background ?? DEFAULT_BACKGROUND).uploads,
    dim: choices.background === 'plain' ? 0 : Math.max(25, sanitizeBackground(current.background ?? DEFAULT_BACKGROUND).dim),
  };
  const starters = ORDER.filter((t) => choices.widgets.includes(t));
  const news = TOPICS.filter((t) => choices.topics.includes(t.id)).map((t) => newsWidget(t.id)).filter((n): n is PlannedWidget => !!n);
  const topTypes = starters.filter((t) => TOP.includes(t));
  const helperTypes = starters.filter((t) => !TOP.includes(t));
  const spots = arrangeStarterWidgets(
    topTypes.map((t) => WANTS[t]),
    helperTypes.map((t) => WANTS[t]),
    news.map(() => NEWS_WANT),
  );
  const place = (type: StarterWidget, spot: { x: number; y: number; w: number; h: number }): PlannedWidget => ({
    type, ...spot, ...(type === 'search' ? { transparent: true } : {}), config: widgetConfig(type, choices),
  });
  const placed = new Map<StarterWidget, PlannedWidget>();
  topTypes.forEach((t, i) => placed.set(t, place(t, spots.top[i]!)));
  helperTypes.forEach((t, i) => placed.set(t, place(t, spots.helpers[i]!)));
  const widgets: PlannedWidget[] = [
    ...starters.map((t) => placed.get(t)!),
    ...news.map((n, i) => ({ ...n, ...spots.news[i]! })),
  ];
  return { appearance, background, widgets };
}
