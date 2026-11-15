import type { KeyValueStore } from '../../storage/store';
import { createConfigStore, requestHostPermission, type FetchFn } from '../shared';
import { createWebDavClient } from './client';

/** Kept in device-local storage only, never synced. Prefer an app password over your main one. */
export interface WebDavConfig {
  /** Folder URL ending in "/". Tabloid keeps one file, tabloid.json, inside it. */
  url: string;
  username: string;
  password: string;
}

const CONFIG_KEY = 'webdav:config';

/** Validates a folder URL and makes it end with "/". Throws a user-readable error. */
export function normalizeWebDavUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Enter the full WebDAV folder address, e.g. https://cloud.example.com/remote.php/dav/files/me/Tabloid/');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('The WebDAV address must start with https:// (or http://).');
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

export function isInsecureWebDavUrl(input: string): boolean {
  return input.trim().toLowerCase().startsWith('http://');
}

export function createWebDavConfigStore(store?: KeyValueStore) {
  return createConfigStore<WebDavConfig>(CONFIG_KEY, store);
}

export type WebDavConfigStore = ReturnType<typeof createWebDavConfigStore>;

/**
 * Verifies the server and credentials, then saves them. Must be called from a user gesture:
 * it first asks permission to contact the server's address (an optional host permission).
 */
export async function connectWebDav(
  input: { url: string; username: string; password: string },
  configStore: WebDavConfigStore = createWebDavConfigStore(),
  fetchFn: FetchFn = fetch,
): Promise<void> {
  const config: WebDavConfig = { url: normalizeWebDavUrl(input.url), username: input.username.trim(), password: input.password };
  if (!config.username) throw new Error('Enter your WebDAV username.');

  await requestHostPermission([`${new URL(config.url).origin}/*`], 'that server');
  // A missing file is fine (first use); rejected credentials or an unreachable server are not.
  await createWebDavClient(async () => config, fetchFn).download();
  await configStore.set(config);
}
