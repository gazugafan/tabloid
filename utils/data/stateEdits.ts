import type { StoredState, WidgetConfig, WidgetInstance } from '../../types/layout';
import { MAX_FEEDS_PER_WIDGET, nextFeedColor, sanitizeRssConfig, type RssFeedRef } from '../rss/config';
import type { OpmlFeed, OpmlFolder } from '../rss/opml';
import { RSS_WIDGET_TYPE } from '../rss/service';
import { nextY, sortForStack } from '../layout';

/** Where imported feeds should go. */
export type OpmlDestination = { kind: 'per-folder' } | { kind: 'single' } | { kind: 'existing'; widgetId: string };

export interface OpmlImportResult {
  state: StoredState;
  widgetsAdded: number;
  feedsAdded: number;
  /** Feeds not added because the target widget was full or already had them. */
  feedsSkipped: number;
}

interface Deps {
  newId?: () => string;
  /** The dashboard new widgets are placed on. */
  dashboard: string;
  /** Size of a new RSS widget, from the widget registry. */
  size: { w: number; h: number };
}

const feedRefs = (feeds: readonly OpmlFeed[], existing: readonly RssFeedRef[] = []): RssFeedRef[] => {
  const refs = [...existing];
  for (const feed of feeds) {
    if (refs.some((r) => r.url === feed.url)) continue;
    refs.push({ url: feed.url, title: feed.title, color: nextFeedColor(refs) });
  }
  return refs;
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/** Adds feeds from an OPML file to the layout: as new RSS widgets, or into one that already exists. */
export function importFeedsIntoState(state: StoredState, folders: readonly OpmlFolder[], destination: OpmlDestination, deps: Deps): OpmlImportResult {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const total = folders.reduce((sum, f) => sum + f.feeds.length, 0);

  if (destination.kind === 'existing') {
    const target = state.widgets.find((w) => w.id === destination.widgetId && w.type === RSS_WIDGET_TYPE);
    if (!target) throw new Error("That widget isn't there any more.");
    const config = sanitizeRssConfig(target.config);
    const room = MAX_FEEDS_PER_WIDGET - config.feeds.length;
    const fresh = folders.flatMap((f) => f.feeds).filter((f) => !config.feeds.some((r) => r.url === f.url));
    const feeds = feedRefs(fresh.slice(0, Math.max(0, room)), config.feeds);
    const added = feeds.length - config.feeds.length;
    const widgets = state.widgets.map((w) => (w.id === target.id ? { ...w, config: { ...config, feeds } as WidgetConfig } : w));
    return { state: { ...state, widgets }, widgetsAdded: 0, feedsAdded: added, feedsSkipped: total - added };
  }

  // One group of feeds per new widget; a group bigger than a widget can hold is split.
  // Folder names become widget titles (a folder split across widgets gets a number).
  const groups =
    destination.kind === 'single'
      ? [{ name: '', feeds: folders.flatMap((f) => f.feeds) }]
      : folders.map((f) => ({ name: f.name, feeds: f.feeds }));
  const pieces = groups.flatMap((g) => {
    const parts = chunk(g.feeds, MAX_FEEDS_PER_WIDGET);
    return parts.map((feeds, i) => ({ feeds, title: g.name && parts.length > 1 ? `${g.name} ${i + 1}` : g.name }));
  });
  const widgets: WidgetInstance[] = [...state.widgets];
  let feedsAdded = 0;
  for (const { feeds: group, title } of pieces) {
    if (group.length === 0) continue;
    const feeds = feedRefs(group);
    const config: WidgetConfig = { ...sanitizeRssConfig({ title }), feeds };
    widgets.push({
      id: newId(),
      dashboard: deps.dashboard,
      type: RSS_WIDGET_TYPE,
      x: 0,
      y: nextY(widgets.filter((w) => w.dashboard === deps.dashboard)),
      w: deps.size.w,
      h: deps.size.h,
      config,
    });
    feedsAdded += feeds.length;
  }
  return { state: { ...state, widgets }, widgetsAdded: widgets.length - state.widgets.length, feedsAdded, feedsSkipped: total - feedsAdded };
}

/**
 * The feeds of every RSS widget as the groups an OPML export is built from: one folder per widget,
 * named after its title, or else its dashboard (numbered when a dashboard has several), in tab and reading order.
 */
export function exportFeedGroups(state: StoredState): Array<{ name: string; feeds: Array<{ title: string; url: string }> }> {
  const groups: Array<{ name: string; feeds: Array<{ title: string; url: string }> }> = [];
  for (const dashboard of state.dashboards) {
    const rss = sortForStack(state.widgets.filter((w) => w.dashboard === dashboard.id)).filter((w) => w.type === RSS_WIDGET_TYPE);
    rss.forEach((widget, index) => {
      // With a single dashboard the dashboard's name says nothing, so use a plain label.
      const config = sanitizeRssConfig(widget.config);
      const base = state.dashboards.length === 1 ? 'RSS feeds' : dashboard.name;
      const name = config.title || (rss.length === 1 ? base : `${base} ${index + 1}`);
      groups.push({ name, feeds: config.feeds.map(({ title, url }) => ({ title, url })) });
    });
  }
  return groups;
}
