import { browser } from 'wxt/browser';
import { createDefaultStore, hasExtensionStorage, type KeyValueStore } from '../storage/store';

export type FetchFn = typeof fetch;

/**
 * Device-local storage for one provider's credentials or connection settings. These are never
 * synced or exported.
 */
export function createConfigStore<T>(key: string, store: KeyValueStore = createDefaultStore()) {
  return {
    get: () => store.get<T>(key),
    set: (value: T) => store.set(key, value),
    clear: () => store.remove(key),
    has: async () => (await store.get<T>(key)) !== undefined,
  };
}

export type ConfigStore<T> = ReturnType<typeof createConfigStore<T>>;

/**
 * Asks the browser for access to hosts (an optional permission). Must be called straight from a
 * user gesture. Outside the installed extension (dev page) there is nothing to ask.
 */
export async function requestHostPermission(origins: string[], name: string): Promise<void> {
  if (!hasExtensionStorage()) return;
  if (!(await browser.permissions.request({ origins }))) throw new Error(`Permission to contact ${name} was declined.`);
}
