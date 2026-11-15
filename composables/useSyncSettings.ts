import { inject, provide, reactive, ref, type InjectionKey } from 'vue';
import { notifyError, notifySuccess } from './useNotify';
import { isRemoteProviderId, REMOTE_PROVIDERS } from '../utils/sync/providers';
import { loadSettings, REMOTE_PROVIDER_IDS, type RemoteProviderId, type SyncProviderId } from '../utils/sync/settings';
import { providerHasData, switchProvider } from '../utils/sync/manager';

/** State and actions behind the options page's Sync section, shared with the per-provider panels. */
export function createSyncSettings() {
  /** The provider in use, and the one currently picked in the form. */
  const current = ref<SyncProviderId>('none');
  const selected = ref<SyncProviderId>('none');
  /** The picked provider already holds a layout (probably from another device). */
  const remoteHasData = ref(false);
  const busy = ref(false);
  const connected = reactive<Record<RemoteProviderId, boolean>>({ dropbox: false, webdav: false, github: false });

  async function refresh() {
    current.value = selected.value = (await loadSettings()).syncProvider;
    for (const id of REMOTE_PROVIDER_IDS) connected[id] = await REMOTE_PROVIDERS[id].isConnected();
  }

  /** Providers that need credentials before they can be used. */
  function needsConnection(provider: SyncProviderId): boolean {
    return isRemoteProviderId(provider) && !connected[provider];
  }

  /** Runs a task with the form disabled, showing any error as a toast. */
  async function run(task: () => Promise<void>) {
    busy.value = true;
    try {
      await task();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : String(error));
    } finally {
      busy.value = false;
    }
  }

  async function checkRemote() {
    remoteHasData.value = false;
    if (selected.value === current.value || selected.value === 'none' || needsConnection(selected.value)) return;
    await run(async () => {
      remoteHasData.value = await providerHasData(selected.value);
    });
  }

  async function apply(keepRemote: boolean) {
    await run(async () => {
      await switchProvider(selected.value, { keepRemote });
      current.value = selected.value;
      remoteHasData.value = false;
      notifySuccess('Saved.');
    });
  }

  async function select() {
    await checkRemote();
    if (selected.value === 'none' && current.value !== 'none') await apply(false);
  }

  /** Call after a provider's credentials were saved. */
  async function markConnected(id: RemoteProviderId) {
    connected[id] = await REMOTE_PROVIDERS[id].isConnected();
    await checkRemote();
  }

  async function disconnect(id: RemoteProviderId) {
    await run(async () => {
      if (current.value === id) await switchProvider('none', { keepRemote: false });
      await REMOTE_PROVIDERS[id].disconnect();
      current.value = selected.value = 'none';
      connected[id] = false;
      notifySuccess(`Disconnected from ${REMOTE_PROVIDERS[id].label.split(' (')[0]}. Your layout stays on this device.`);
    });
  }

  return { current, selected, remoteHasData, busy, connected, refresh, needsConnection, run, select, apply, markConnected, disconnect };
}

export type SyncSettings = ReturnType<typeof createSyncSettings>;

const KEY: InjectionKey<SyncSettings> = Symbol('syncSettings');

export function provideSyncSettings(settings: SyncSettings) {
  provide(KEY, settings);
}

export function useSyncSettings(): SyncSettings {
  const settings = inject(KEY);
  if (!settings) throw new Error('useSyncSettings must be used inside a SyncSection');
  return settings;
}
