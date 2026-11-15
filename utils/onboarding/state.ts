import { createDefaultStore, type KeyValueStore } from '../storage/store';

const DONE_KEY = 'onboarding:done';

/**
 * Whether the welcome setup was finished or skipped on this device. Device-local on purpose: a new
 * device that gets its dashboard through sync arrives with widgets and so isn't welcomed again either.
 */
export function createOnboardingState(store: KeyValueStore = createDefaultStore()) {
  return {
    isDone: async () => (await store.get<boolean>(DONE_KEY)) === true,
    markDone: () => store.set(DONE_KEY, true),
  };
}

/** The welcome appears on a device that never saw it and has nothing on its dashboards yet. */
export const shouldWelcome = (done: boolean, widgetCount: number) => !done && widgetCount === 0;
