import type { ThemeMode } from '../appearance';
import { POPULAR_CATEGORIES, type PopularFeed } from '../rss/popular';

export type BackgroundChoice = 'bing' | 'wikimedia' | 'plain';
export type StarterWidget = 'search' | 'clock' | 'weather' | 'bookmarks' | 'todo' | 'notes';

export interface Topic {
  /** The directory category this topic takes its feeds from. */
  id: string;
  emoji: string;
  /** A friendly one-liner. */
  about: string;
}

/** Topics offered in the welcome, with plain-language descriptions. Feeds come from the hand-checked directory. */
export const TOPICS: readonly Topic[] = [
  { id: 'News', emoji: '📰', about: 'What’s happening in the world' },
  { id: 'Technology', emoji: '💻', about: 'Gadgets, apps and the internet' },
  { id: 'Science & Space', emoji: '🔭', about: 'Discoveries and the cosmos' },
  { id: 'Business & Finance', emoji: '📈', about: 'Markets, money and companies' },
  { id: 'Sports', emoji: '⚽', about: 'Scores, stories and highlights' },
  { id: 'Gaming', emoji: '🎮', about: 'Video games and game culture' },
  { id: 'Entertainment & Culture', emoji: '🎬', about: 'Film, TV, music and books' },
  { id: 'Design & Lifestyle', emoji: '🎨', about: 'Design, home, food and style' },
  { id: 'Programming', emoji: '👩‍💻', about: 'For people who write code' },
  { id: 'Comics', emoji: '🗯️', about: 'Webcomics for a daily smile' },
];

/** How many feeds a topic's widget starts with. */
export const FEEDS_PER_TOPIC = 4;

/** The feeds a topic starts with: the directory's featured ones first, then the most widely read. */
export function topicFeeds(topicId: string): PopularFeed[] {
  const feeds = POPULAR_CATEGORIES.find((c) => c.name === topicId)?.feeds ?? [];
  return [...feeds.filter((f) => f.featured), ...feeds.filter((f) => !f.featured)].slice(0, FEEDS_PER_TOPIC);
}

export interface QuickSite {
  id: string;
  title: string;
  url: string;
}

export const QUICK_SITES: readonly QuickSite[] = [
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'wikipedia', title: 'Wikipedia', url: 'https://www.wikipedia.org/' },
  { id: 'reddit', title: 'Reddit', url: 'https://www.reddit.com/' },
  { id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/' },
  { id: 'maps', title: 'Maps', url: 'https://www.google.com/maps' },
  { id: 'amazon', title: 'Amazon', url: 'https://www.amazon.com/' },
  { id: 'netflix', title: 'Netflix', url: 'https://www.netflix.com/' },
  { id: 'github', title: 'GitHub', url: 'https://github.com/' },
];

export interface WidgetOption {
  id: StarterWidget;
  emoji: string;
  name: string;
  about: string;
}

export const WIDGET_OPTIONS: readonly WidgetOption[] = [
  { id: 'search', emoji: '🔍', name: 'Search', about: 'Search the web right from your new tab' },
  { id: 'clock', emoji: '🕒', name: 'Clock', about: 'The time and date at a glance' },
  { id: 'weather', emoji: '⛅', name: 'Weather', about: 'Today’s weather and the days ahead' },
  { id: 'bookmarks', emoji: '🔖', name: 'Quick links', about: 'One-click shortcuts to your favorite sites' },
  { id: 'todo', emoji: '✅', name: 'To-do list', about: 'Tasks to tick off, always in view' },
  { id: 'notes', emoji: '📝', name: 'Notes', about: 'A page for jotting things down' },
];

export interface OnboardingChoices {
  mode: ThemeMode;
  accent: string | null;
  background: BackgroundChoice;
  topics: string[];
  widgets: StarterWidget[];
  place: { name: string; detail: string; latitude: number; longitude: number } | null;
  sites: string[];
}

export const DEFAULT_CHOICES: OnboardingChoices = {
  mode: 'system',
  accent: null,
  background: 'bing',
  topics: [],
  widgets: ['search', 'clock', 'bookmarks'],
  place: null,
  sites: ['youtube', 'wikipedia', 'reddit', 'gmail'],
};

/** Accent colors offered in the welcome (all readable against both themes). */
export const ACCENT_CHOICES: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Violet', color: '#8b5cf6' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'Red', color: '#ef4444' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Green', color: '#22c55e' },
  { name: 'Teal', color: '#14b8a6' },
];
