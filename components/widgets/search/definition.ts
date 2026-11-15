import { defineAsyncComponent } from 'vue';
import type { WidgetDefinition } from '../registry';
import { DEFAULT_SEARCH_CONFIG } from './config';

export const definition: WidgetDefinition = {
  type: 'search',
  name: 'Search',
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 2, h: 1 },
  defaultConfig: () => ({ ...DEFAULT_SEARCH_CONFIG }),
  component: defineAsyncComponent(() => import('./SearchWidget.vue')),
  settings: defineAsyncComponent(() => import('./SearchSettings.vue')),
};
