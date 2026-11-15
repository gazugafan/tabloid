import { defineAsyncComponent } from 'vue';
import type { WidgetDefinition } from '../registry';
import { DEFAULT_WEBPAGES_CONFIG } from './config';

export const definition: WidgetDefinition = {
  type: 'webpages',
  name: 'Webpages',
  defaultSize: { w: 6, h: 6 },
  minSize: { w: 2, h: 2 },
  defaultConfig: () => ({ ...DEFAULT_WEBPAGES_CONFIG, pages: [] }),
  component: defineAsyncComponent(() => import('./WebpagesWidget.vue')),
  settings: defineAsyncComponent(() => import('./WebpagesSettings.vue')),
};
