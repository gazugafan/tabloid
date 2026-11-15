import { defineAsyncComponent } from 'vue';
import type { WidgetDefinition } from '../registry';
import { DEFAULT_WEATHER_CONFIG } from './config';

export const definition: WidgetDefinition = {
  type: 'weather',
  name: 'Weather',
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 2, h: 2 },
  defaultConfig: () => ({ ...DEFAULT_WEATHER_CONFIG }),
  component: defineAsyncComponent(() => import('./WeatherWidget.vue')),
  settings: defineAsyncComponent(() => import('./WeatherSettings.vue')),
};
