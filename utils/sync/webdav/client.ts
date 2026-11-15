import type { StoredState } from '../../../types/layout';
import { RemoteConflictError, type RemoteFileClient, type RemoteState } from '../remote/types';
import { bytesToBase64 } from '../../encoding';
import type { FetchFn } from '../shared';
import type { WebDavConfig } from './config';

const FILE_NAME = 'tabloid.json';

function basicAuth(username: string, password: string): string {
  return `Basic ${bytesToBase64(new TextEncoder().encode(`${username}:${password}`))}`;
}

/**
 * Stores the document as one file in a WebDAV folder, using ETags for conflict detection.
 * The config is read per call so credential changes apply immediately.
 */
export function createWebDavClient(getConfig: () => Promise<WebDavConfig>, fetchFn: FetchFn = fetch): RemoteFileClient {
  async function request(method: string, target: 'file' | 'folder', extra: Record<string, string> = {}, body?: string) {
    const config = await getConfig();
    return fetchFn(target === 'file' ? config.url + FILE_NAME : config.url, {
      method,
      headers: { Authorization: basicAuth(config.username, config.password), ...extra },
      body,
      cache: 'no-store',
    });
  }

  function fail(response: Response, action: string): never {
    if (response.status === 401 || response.status === 403) {
      throw new Error('The WebDAV server rejected the username or password.');
    }
    throw new Error(`WebDAV ${action} failed (${response.status}).`);
  }

  const client: RemoteFileClient = {
    async download(): Promise<RemoteState | null> {
      const response = await request('GET', 'file');
      if (response.status === 404) return null;
      if (!response.ok) fail(response, 'download');
      const rev = response.headers.get('etag');
      if (!rev) throw new Error("This WebDAV server doesn't provide ETags, which Tabloid needs to detect conflicts.");
      return { state: JSON.parse(await response.text()), rev };
    },

    async upload(state: StoredState, rev?: string) {
      const headers = { 'Content-Type': 'application/json', ...(rev ? { 'If-Match': rev } : { 'If-None-Match': '*' }) };
      const body = JSON.stringify(state);
      let response = await request('PUT', 'file', headers, body);
      if (response.status === 409) {
        // The folder doesn't exist yet: create it (405 means it already does) and try once more.
        const created = await request('MKCOL', 'folder');
        if (created.ok || created.status === 405) response = await request('PUT', 'file', headers, body);
      }
      if (response.status === 412) throw new RemoteConflictError();
      if (!response.ok) fail(response, 'upload');
      const newRev = response.headers.get('etag') ?? (await client.download())?.rev;
      if (!newRev) throw new Error("This WebDAV server doesn't provide ETags, which Tabloid needs to detect conflicts.");
      return newRev;
    },
  };
  return client;
}
