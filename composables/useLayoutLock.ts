import { onMounted, ref, watch } from 'vue';
import { createDefaultStore, type KeyValueStore } from '../utils/storage/store';

/** Whether this device keeps its layout locked. Device-local, like the dashboard shown: a phone and a desktop can differ. */
export const LAYOUT_LOCKED_KEY = 'ui:locked';

/** Unlocked by default. The saved choice is read on mount and saved whenever it changes. */
export function useLayoutLock(store: KeyValueStore = createDefaultStore()) {
  const locked = ref(false);
  let restored = false; // Don't save the default over the saved choice before it was read.
  onMounted(async () => {
    try {
      locked.value = (await store.get<boolean>(LAYOUT_LOCKED_KEY)) === true;
    } catch {
      // Storage unavailable: stay unlocked.
    }
    restored = true;
  });
  watch(locked, (value) => {
    if (restored) void store.set(LAYOUT_LOCKED_KEY, value).catch(() => undefined);
  });
  return locked;
}
