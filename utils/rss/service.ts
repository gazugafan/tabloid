import type { WidgetInstance } from '../../types/layout';
import { createFeedCache } from './cache';
import { sanitizeRssConfig } from './config';
import { mergeWanted, type WantedFeed } from './wanted';
import type { RssRequest, RssResponse } from './messages';
import { refreshFeeds, type RefreshDeps } from './refresh';
import { safeUrl } from './text';

export const RSS_WIDGET_TYPE = 'rss';

/** Every feed used by an RSS widget in this layout, with the refresh interval its widget asked for. */
export function collectWantedFeeds(widgets: readonly WidgetInstance[]): WantedFeed[] {
  const entries = widgets
    .filter((w) => w.type === RSS_WIDGET_TYPE)
    .flatMap((w) => {
      const config = sanitizeRssConfig(w.config);
      return config.feeds.map((f) => ({ url: f.url, minutes: config.refreshMinutes }));
    });
  return mergeWanted(entries);
}

/** Every feed address used by an RSS widget in this layout. */
export function collectFeedUrls(widgets: readonly WidgetInstance[]): string[] {
  const urls = widgets.filter((w) => w.type === RSS_WIDGET_TYPE).flatMap((w) => sanitizeRssConfig(w.config).feeds.map((f) => f.url));
  return [...new Set(urls)];
}

/** Handles one request from the new tab page. Never throws; problems come back as `{ ok: false }`. */
export async function handleRssRequest(request: RssRequest, deps: Partial<RefreshDeps> = {}): Promise<RssResponse> {
  try {
    const urls = request.urls.map((u) => safeUrl(u)).filter((u): u is string => u !== undefined);
    await refreshFeeds(urls, { cache: createFeedCache(), ...deps }, { force: request.force, ttlMs: request.ttlMs, icons: true });
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
