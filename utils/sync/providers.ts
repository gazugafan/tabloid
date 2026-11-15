import { createAuthStore } from './dropbox/auth';
import { createDropboxClient } from './dropbox/client';
import { createGitHubClient } from './github/client';
import { createGitHubConfigStore } from './github/config';
import type { RemoteFileClient } from './remote/types';
import type { RemoteProviderId } from './settings';
import type { KeyValueStore } from '../storage/store';
import { createWebDavClient } from './webdav/client';
import { createWebDavConfigStore } from './webdav/config';

/** What the rest of the app needs to know about a remote sync provider. */
export interface RemoteProviderDef {
  id: RemoteProviderId;
  /** Shown in the options page. */
  label: string;
  /** `local` holds the provider's credentials. */
  createClient(local?: KeyValueStore): RemoteFileClient;
  isConnected(local?: KeyValueStore): Promise<boolean>;
  /** Forgets the credentials on this device. */
  disconnect(local?: KeyValueStore): Promise<void>;
}

/** Throws a readable error when the provider has no saved connection. */
async function requireConfig<T>(get: () => Promise<T | undefined>, name: string): Promise<T> {
  const config = await get();
  if (!config) throw new Error(`${name} is not set up.`);
  return config;
}

/** Adding a provider: add its id to `REMOTE_PROVIDER_IDS`, an entry here, and a panel in components/settings/. */
export const REMOTE_PROVIDERS: Record<RemoteProviderId, RemoteProviderDef> = {
  dropbox: {
    id: 'dropbox',
    label: 'Dropbox',
    createClient: (local) => createDropboxClient(createAuthStore(local)),
    isConnected: (local) => createAuthStore(local).has(),
    disconnect: (local) => createAuthStore(local).clear(),
  },
  webdav: {
    id: 'webdav',
    label: 'WebDAV (Nextcloud, ownCloud, NAS…)',
    createClient: (local) => createWebDavClient(() => requireConfig(createWebDavConfigStore(local).get, 'WebDAV')),
    isConnected: (local) => createWebDavConfigStore(local).has(),
    disconnect: (local) => createWebDavConfigStore(local).clear(),
  },
  github: {
    id: 'github',
    label: 'GitHub repository',
    createClient: (local) => createGitHubClient(() => requireConfig(createGitHubConfigStore(local).get, 'GitHub')),
    isConnected: (local) => createGitHubConfigStore(local).has(),
    disconnect: (local) => createGitHubConfigStore(local).clear(),
  },
};

export function isRemoteProviderId(id: string): id is RemoteProviderId {
  return id in REMOTE_PROVIDERS;
}
