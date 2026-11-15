import { browser } from 'wxt/browser';

/** Minimal async key-value store so the app doesn't care where data lives. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  getMany(keys: string[]): Promise<Record<string, unknown>>;
  set(key: string, value: unknown): Promise<void>;
  /** Writes all items in one operation (matters for sync write-rate limits). */
  setMany(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  removeMany(keys: string[]): Promise<void>;
  /** Reports changed keys, from this and other contexts. Returns an unsubscribe function. */
  subscribe(onChange: (keys: string[]) => void): () => void;
}

/**
 * A plain-data copy of a value. Firefox stores data with the structured clone algorithm, which throws
 * on Vue's reactive proxies ("Proxy object could not be cloned"); Chrome quietly converts to JSON.
 * Doing the conversion ourselves makes every caller safe in both.
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createExtensionStore(area: 'local' | 'sync' = 'local'): KeyValueStore {
  return {
    async get<T>(key: string) {
      const result = await browser.storage[area].get(key);
      return result[key] as T | undefined;
    },
    async getMany(keys) {
      return keys.length ? await browser.storage[area].get(keys) : {};
    },
    async set(key, value) {
      await browser.storage[area].set({ [key]: plain(value) });
    },
    async setMany(items) {
      if (Object.keys(items).length) await browser.storage[area].set(plain(items));
    },
    async remove(key) {
      await browser.storage[area].remove(key);
    },
    async removeMany(keys) {
      if (keys.length) await browser.storage[area].remove(keys);
    },
    subscribe(onChange) {
      const listener = (changes: Record<string, unknown>, areaName: string) => {
        if (areaName === area) onChange(Object.keys(changes));
      };
      browser.storage.onChanged.addListener(listener);
      return () => browser.storage.onChanged.removeListener(listener);
    },
  };
}

/** Used when the page isn't running as an extension (plain dev server, future hosted build). */
export function createLocalStorageStore(prefix = 'tabloid:'): KeyValueStore {
  return {
    async get<T>(key: string) {
      const raw = localStorage.getItem(prefix + key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    },
    async getMany(keys) {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        const raw = localStorage.getItem(prefix + key);
        if (raw !== null) result[key] = JSON.parse(raw);
      }
      return result;
    },
    async set(key, value) {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    },
    async setMany(items) {
      for (const [key, value] of Object.entries(items)) localStorage.setItem(prefix + key, JSON.stringify(value));
    },
    async remove(key) {
      localStorage.removeItem(prefix + key);
    },
    async removeMany(keys) {
      for (const key of keys) localStorage.removeItem(prefix + key);
    },
    subscribe(onChange) {
      // The browser only fires "storage" in other tabs, which is what we want here.
      const listener = (event: StorageEvent) => {
        if (event.key?.startsWith(prefix)) onChange([event.key.slice(prefix.length)]);
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },
  };
}

export function hasExtensionStorage(): boolean {
  try {
    return typeof browser?.storage?.local?.get === 'function';
  } catch {
    return false;
  }
}

/** Device-local store: extension storage, or localStorage on a plain page. */
export function createDefaultStore(): KeyValueStore {
  return hasExtensionStorage() ? createExtensionStore('local') : createLocalStorageStore();
}

/** Browser-account sync store. On a plain page this is faked with a separate localStorage namespace. */
export function createBrowserSyncStore(): KeyValueStore {
  return hasExtensionStorage() ? createExtensionStore('sync') : createLocalStorageStore('tabloid-sync:');
}
