import { defineAsyncComponent } from 'vue';
import type { WidgetDefinition } from '../registry';
import { DEFAULT_BOOKMARKS_CONFIG } from './config';

export const definition: WidgetDefinition = {
  type: 'bookmarks',
  name: 'Quick links',
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 2, h: 2 },
  defaultConfig: () => ({ ...DEFAULT_BOOKMARKS_CONFIG }),
  component: defineAsyncComponent(() => import('./BookmarksWidget.vue')),
  settings: defineAsyncComponent(() => import('./BookmarksSettings.vue')),
};
