import type { StoredState } from '../../../types/layout';
import { RemoteConflictError, type RemoteFileClient, type RemoteState } from '../remote/types';
import type { FetchFn } from '../shared';
import { getAccessToken, type AuthStore } from './auth';

const FILE_PATH = '/tabloid.json';
const DOWNLOAD_URL = 'https://content.dropboxapi.com/2/files/download';
const UPLOAD_URL = 'https://content.dropboxapi.com/2/files/upload';

export type DropboxClient = RemoteFileClient;

export function createDropboxClient(authStore: AuthStore, fetchFn: FetchFn = fetch): DropboxClient {
  /** Calls the API; on 401 refreshes the token once and retries. */
  async function call(url: string, init: (token: string) => RequestInit): Promise<Response> {
    let response = await fetchFn(url, init(await getAccessToken(authStore, fetchFn)));
    if (response.status === 401) {
      response = await fetchFn(url, init(await getAccessToken(authStore, fetchFn, { force: true })));
    }
    return response;
  }

  async function errorSummary(response: Response): Promise<string> {
    const text = await response.text();
    try {
      return (JSON.parse(text) as { error_summary?: string }).error_summary ?? text;
    } catch {
      return text;
    }
  }

  return {
    async download(): Promise<RemoteState | null> {
      const response = await call(DOWNLOAD_URL, (token) => ({
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: FILE_PATH }) },
      }));
      if (response.status === 409) {
        const summary = await errorSummary(response);
        if (summary.includes('not_found')) return null;
        throw new Error(`Dropbox download failed: ${summary}`);
      }
      if (!response.ok) throw new Error(`Dropbox download failed (${response.status})`);
      const metadata = JSON.parse(response.headers.get('dropbox-api-result') ?? '{}') as { rev?: string };
      if (!metadata.rev) throw new Error('Dropbox response had no file revision');
      return { state: JSON.parse(await response.text()), rev: metadata.rev };
    },

    async upload(state, rev) {
      const arg = {
        path: FILE_PATH,
        mode: rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' },
        autorename: false,
        mute: true,
      };
      const response = await call(UPLOAD_URL, (token) => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify(arg),
        },
        body: JSON.stringify(state),
      }));
      if (response.status === 409) {
        const summary = await errorSummary(response);
        if (summary.includes('conflict')) throw new RemoteConflictError();
        throw new Error(`Dropbox upload failed: ${summary}`);
      }
      if (!response.ok) throw new Error(`Dropbox upload failed (${response.status})`);
      return ((await response.json()) as { rev: string }).rev;
    },
  };
}
