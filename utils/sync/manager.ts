import { getWidgetDefinition, isConfigSynced } from '../../components/widgets/registry';
import {
  createSingleKeyRepository,
  createSplitRepository,
  isRemoteRepository,
  type StateRepository,
} from '../storage/repository';
import { createBrowserSyncStore, createDefaultStore, type KeyValueStore } from '../storage/store';
import { isRemoteProviderId, REMOTE_PROVIDERS } from './providers';
import { READ_STATE_KEY } from '../rss/readState';
import { createRemoteRepository } from './remote/repository';
import { loadSettings, saveSettings, type SyncProviderId } from './settings';

export function createRepository(provider: SyncProviderId, local: KeyValueStore = createDefaultStore()): StateRepository {
  if (isRemoteProviderId(provider)) {
    return createRemoteRepository(REMOTE_PROVIDERS[provider].createClient(local), local, provider);
  }
  if (provider === 'browser') {
    return createSplitRepository(createBrowserSyncStore(), local, {
      syncsConfig: isConfigSynced,
      defaultConfig: (type) => getWidgetDefinition(type)?.defaultConfig() ?? {},
      // Read history can grow large; storage.sync has little room, so it stays on this device there.
      syncsPreference: (key) => key !== READ_STATE_KEY,
    });
  }
  return createSingleKeyRepository(local);
}

export async function createConfiguredRepository(): Promise<StateRepository> {
  return createRepository((await loadSettings()).syncProvider);
}

/** True if the provider already holds a layout (e.g. synced from another device). */
export async function providerHasData(provider: SyncProviderId): Promise<boolean> {
  if (isRemoteProviderId(provider)) return (await REMOTE_PROVIDERS[provider].createClient().download()) !== null;
  return (await createRepository(provider).load()) !== undefined;
}

/**
 * Switches provider. `keepRemote` adopts what the new provider already holds;
 * otherwise this device's current layout overwrites it.
 */
export async function switchProvider(
  next: SyncProviderId,
  options: { keepRemote: boolean },
  local: KeyValueStore = createDefaultStore(),
): Promise<void> {
  const settings = await loadSettings(local);
  const current = settings.syncProvider;
  if (current !== next) {
    const target = createRepository(next, local);
    if (isRemoteRepository(target)) {
      if (options.keepRemote) {
        await target.pull(); // Empty cache and no local changes: adopts the remote file.
      } else {
        const state = await createRepository(current, local).load();
        if (state) await target.save(state);
      }
      const error = target.getError();
      if (error) throw new Error(error);
    } else if (!(options.keepRemote && (await target.load()))) {
      const state = await createRepository(current, local).load();
      if (state) await target.save(state);
    }
  }
  await saveSettings({ ...settings, syncProvider: next }, local);
}
