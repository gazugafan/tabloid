import { defineAsyncComponent } from 'vue';
import { DEFAULT_RSS_CONFIG } from '../../../utils/rss/config';
import type { WidgetDefinition } from '../registry';

export const definition: WidgetDefinition = {
  type: 'rss',
  name: 'RSS feeds',
  defaultSize: { w: 4, h: 9 },
  minSize: { w: 2, h: 4 },
  defaultConfig: () => ({ ...DEFAULT_RSS_CONFIG, feeds: [] }),
  // Only the feed list and display options live here; fetched articles are cached on the device, never synced.
  component: defineAsyncComponent(() => import('./RssWidget.vue')),
  settings: defineAsyncComponent(() => import('./RssSettings.vue')),
};
