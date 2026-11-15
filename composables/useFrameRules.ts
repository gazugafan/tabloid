import { watch, type Ref } from 'vue';
import { applyFrameRules, wantsFrameRules, frameAccessVersion, frameRulesBusy } from '../components/widgets/webpages/frameRules';
import { notifyError } from './useNotify';
import type { WidgetInstance } from '../types/layout';

/** Keeps the browser's header rules in step with the Webpages widgets that ask for them. */
export function useFrameRules(widgets: Ref<WidgetInstance[]>, loaded: Ref<boolean>) {
  watch(
    [() => (loaded.value ? wantsFrameRules(widgets.value) : null), frameAccessVersion],
    ([wanted]) => {
      if (wanted === null) return;
      frameRulesBusy.value = true; // Set now, so frames don't start loading before the rules are in place.
      applyFrameRules(wanted).catch((error) => notifyError(error instanceof Error ? error.message : String(error)));
    },
    { immediate: true, flush: 'sync' },
  );
}
