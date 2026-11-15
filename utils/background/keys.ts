import { createConfigStore } from '../sync/shared';
import type { KeyValueStore } from '../storage/store';

/** API keys the user supplied for image services. Device-local only: never synced or exported. */
export interface ApiKeys {
  unsplash?: string;
}

export function createApiKeyStore(store?: KeyValueStore) {
  return createConfigStore<ApiKeys>('background:keys', store);
}

export async function readApiKeys(store?: KeyValueStore): Promise<ApiKeys> {
  return (await createApiKeyStore(store).get()) ?? {};
}

/** Keys are pasted by hand, so trim stray whitespace and reject anything that isn't plain key text. */
export function cleanApiKey(input: string): string {
  const key = input.trim();
  if (key && !/^[\w-]{8,100}$/.test(key)) throw new Error("That doesn't look like an API key. Copy it exactly as shown.");
  return key;
}
