import { defineAsyncComponent } from 'vue';
import type { WidgetDefinition } from '../registry';
import { DEFAULT_CLOCK_CONFIG } from './config';

export const definition: WidgetDefinition = {
  type: 'clock',
  name: 'Clock',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  defaultConfig: () => ({ ...DEFAULT_CLOCK_CONFIG }),
  component: defineAsyncComponent(() => import('./ClockWidget.vue')),
  settings: defineAsyncComponent(() => import('./ClockSettings.vue')),
};
