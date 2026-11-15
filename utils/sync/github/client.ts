import type { StoredState } from '../../../types/layout';
import { RemoteConflictError, type RemoteFileClient, type RemoteState } from '../remote/types';
import { base64ToText, textToBase64 } from '../../encoding';
import type { FetchFn } from '../shared';
import type { GitHubConfig } from './config';

const API = 'https://api.github.com';

interface ContentsResponse {
  sha?: string;
  content?: string;
  encoding?: string;
  size?: number;
}

/**
 * Stores the document as one file in a GitHub repository (Contents API). The blob SHA is the
 * revision: an update with a stale SHA is rejected, which gives us conflict detection.
 * The config is read per call so token changes apply immediately.
 */
export function createGitHubClient(getConfig: () => Promise<GitHubConfig>, fetchFn: FetchFn = fetch): RemoteFileClient {
  async function request(method: string, extra: Record<string, string> = {}, body?: unknown, query = '') {
    const config = await getConfig();
    const url = `${API}/repos/${config.repo}/contents/${config.path.split('/').map(encodeURIComponent).join('/')}${query}`;
    return fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  }

  async function branchQuery(): Promise<string> {
    const { branch } = await getConfig();
    return branch ? `?ref=${encodeURIComponent(branch)}` : '';
  }

  async function fail(response: Response, action: string): Promise<never> {
    if (response.status === 401) throw new Error('GitHub rejected the access token. It may have expired or been revoked.');
    if (response.status === 403 || response.status === 429) {
      const limited = response.headers.get('x-ratelimit-remaining') === '0' || response.status === 429;
      throw new Error(
        limited ? 'GitHub rate limit reached. Sync will retry later.' : 'The GitHub token is not allowed to access this repository (it needs Contents read and write).',
      );
    }
    if (response.status === 404) throw new Error('GitHub could not find that repository or branch, or the token has no access to it.');
    throw new Error(`GitHub ${action} failed (${response.status}).`);
  }

  return {
    async download(): Promise<RemoteState | null> {
      const query = await branchQuery();
      const response = await request('GET', {}, undefined, query);
      if (response.status === 404) return null;
      if (!response.ok) return fail(response, 'download');
      const file = (await response.json()) as ContentsResponse;
      if (!file.sha) throw new Error('GitHub returned an unexpected response.');
      let text: string;
      if (file.content && file.encoding === 'base64') {
        text = base64ToText(file.content);
      } else {
        // Files over 1 MB come back without content: fetch the raw body for that version.
        const raw = await request('GET', { Accept: 'application/vnd.github.raw+json' }, undefined, query);
        if (!raw.ok) return fail(raw, 'download');
        text = await raw.text();
      }
      return { state: JSON.parse(text), rev: file.sha };
    },

    async upload(state: StoredState, rev?: string) {
      const { branch } = await getConfig();
      const response = await request('PUT', {}, {
        message: 'Update Tabloid layout',
        content: textToBase64(JSON.stringify(state, null, 2)),
        ...(rev ? { sha: rev } : {}),
        ...(branch ? { branch } : {}),
      });
      // 409: the sha is stale. 422: no sha was given but the file exists (or the reverse).
      if (response.status === 409 || response.status === 422) throw new RemoteConflictError();
      if (!response.ok) return fail(response, 'upload');
      const result = (await response.json()) as { content?: { sha?: string } };
      const sha = result.content?.sha;
      if (!sha) throw new Error('GitHub returned an unexpected response.');
      return sha;
    },
  };
}
