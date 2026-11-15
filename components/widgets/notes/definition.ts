import { defineAsyncComponent } from 'vue';
import type { WidgetDefinition } from '../registry';

export const definition: WidgetDefinition = {
  type: 'notes',
  name: 'Notes',
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 2, h: 3 },
  defaultConfig: () => ({ text: '' }),
  // Notes can grow large, so their text stays on this device when using size-limited sync.
  syncConfig: false,
  component: defineAsyncComponent(() => import('./NotesWidget.vue')),
};
