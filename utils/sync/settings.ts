import { createDefaultStore, type KeyValueStore } from '../storage/store';

/** Providers that keep the whole document in one remote file. Each needs an entry in `REMOTE_PROVIDERS`. */
export const REMOTE_PROVIDER_IDS = ['dropbox', 'webdav', 'github'] as const;
export type RemoteProviderId = (typeof REMOTE_PROVIDER_IDS)[number];

export const SYNC_PROVIDER_IDS = ['none', 'browser', ...REMOTE_PROVIDER_IDS] as const;
export type SyncProviderId = (typeof SYNC_PROVIDER_IDS)[number];

export interface Settings {
  version: 1;
  /** Chosen per device; each device must opt in to the same provider. */
  syncProvider: SyncProviderId;
}

const SETTINGS_KEY = 'settings';
const defaults: Settings = { version: 1, syncProvider: 'none' };

function isProvider(value: unknown): value is SyncProviderId {
  return (SYNC_PROVIDER_IDS as readonly unknown[]).includes(value);
}

export async function loadSettings(store: KeyValueStore = createDefaultStore()): Promise<Settings> {
  const raw = await store.get<Partial<Settings>>(SETTINGS_KEY);
  // Unknown fields are kept so an older version never strips settings written by a newer one.
  return { ...raw, ...defaults, syncProvider: isProvider(raw?.syncProvider) ? raw.syncProvider : defaults.syncProvider };
}

export async function saveSettings(settings: Settings, store: KeyValueStore = createDefaultStore()): Promise<void> {
  await store.set(SETTINGS_KEY, settings);
}

export function subscribeSettings(onChange: () => void, store: KeyValueStore = createDefaultStore()): () => void {
  return store.subscribe((keys) => keys.includes(SETTINGS_KEY) && onChange());
}
