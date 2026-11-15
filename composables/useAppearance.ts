import { watch, type Ref } from 'vue';
import { applyAppearance, sanitizeAppearance } from '../utils/appearance';

export const APPEARANCE_KEY = 'appearance';

/**
 * Keeps the page's look in step with the stored appearance preference. Waits until preferences
 * have loaded, so the cached look painted at startup isn't replaced by defaults in the meantime.
 */
export function useAppearance(preferences: Ref<Record<string, unknown>>, ready: Ref<boolean>) {
  watch(
    [ready, () => preferences.value[APPEARANCE_KEY]],
    ([isReady, raw]) => isReady && applyAppearance(sanitizeAppearance(raw)),
    { immediate: true },
  );
}
