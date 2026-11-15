import { defineAsyncComponent } from 'vue';
import type { WidgetDefinition } from '../registry';

/** A sample widget for trying out the shared loading indicator. */
export const definition: WidgetDefinition = {
  type: 'loading-test',
  name: 'Loading test',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  defaultConfig: () => ({}),
  devOnly: true,
  component: defineAsyncComponent(() => import('./LoadingTestWidget.vue')),
};
