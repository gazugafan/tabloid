import { defineAsyncComponent } from 'vue';
import type { WidgetDefinition } from '../registry';
import { DEFAULT_TODO_CONFIG } from './config';

export const definition: WidgetDefinition = {
  type: 'todo',
  name: 'To-do list',
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 2, h: 3 },
  defaultConfig: () => ({ ...DEFAULT_TODO_CONFIG }),
  // A long list can outgrow browser sync's size limit, so with that provider it stays on this device.
  syncConfig: false,
  component: defineAsyncComponent(() => import('./TodoWidget.vue')),
  settings: defineAsyncComponent(() => import('./TodoSettings.vue')),
};
