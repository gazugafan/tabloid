import { computed, type Ref } from 'vue';
import { nextFeedColor, sanitizeRssConfig, type RssConfig, type RssFeedRef } from '../../../utils/rss/config';
import type { WidgetConfig } from '../../../types/layout';

/** Shared editing helpers for the RSS widget and its settings panel. */
export function useRssConfig(source: Ref<WidgetConfig>, emitUpdate: (config: WidgetConfig) => void) {
  const config = computed<RssConfig>(() => sanitizeRssConfig(source.value));

  const update = (patch: Partial<RssConfig>) => emitUpdate({ ...sanitizeRssConfig({ ...config.value, ...patch }) });

  /** Adds feeds that aren't already in the widget; colors are handed out in turn. */
  function addFeeds(additions: ReadonlyArray<{ url: string; title: string }>) {
    const feeds: RssFeedRef[] = [...config.value.feeds];
    for (const { url, title } of additions) {
      if (feeds.some((f) => f.url === url)) continue;
      feeds.push({ url, title, color: nextFeedColor(feeds) });
    }
    update({ feeds });
  }

  function updateFeed(url: string, patch: Partial<Pick<RssFeedRef, 'title' | 'color'>>) {
    update({ feeds: config.value.feeds.map((f) => (f.url === url ? { ...f, ...patch } : f)) });
  }

  function removeFeed(url: string) {
    update({ feeds: config.value.feeds.filter((f) => f.url !== url) });
  }

  return { config, update, addFeeds, updateFeed, removeFeed };
}
