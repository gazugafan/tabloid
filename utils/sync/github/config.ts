import type { KeyValueStore } from '../../storage/store';
import { createConfigStore, requestHostPermission, type FetchFn } from '../shared';
import { createGitHubClient } from './client';

/** Kept in device-local storage only, never synced. */
export interface GitHubConfig {
  /** "owner/name". */
  repo: string;
  /** Empty means the repository's default branch. */
  branch: string;
  /** Path of the file inside the repository. */
  path: string;
  /** A fine-grained personal access token with Contents read and write on this repository. */
  token: string;
}

export const DEFAULT_GITHUB_PATH = 'tabloid.json';

const CONFIG_KEY = 'github:config';

/** Accepts "owner/name" or a github.com URL. Throws a user-readable error. */
export function normalizeGitHubRepo(input: string): string {
  const text = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(text)) throw new Error('Enter the repository as owner/name, e.g. me/tabloid-sync.');
  return text;
}

export function normalizeGitHubPath(input: string): string {
  const path = input.trim().replace(/^\/+/, '') || DEFAULT_GITHUB_PATH;
  if (path.endsWith('/') || path.split('/').some((part) => part === '..' || part === '')) {
    throw new Error('Enter a file path inside the repository, e.g. tabloid.json.');
  }
  return path;
}

export function createGitHubConfigStore(store?: KeyValueStore) {
  return createConfigStore<GitHubConfig>(CONFIG_KEY, store);
}

export type GitHubConfigStore = ReturnType<typeof createGitHubConfigStore>;

/**
 * Verifies the repository and token, then saves them. Must be called from a user gesture:
 * it first asks permission to contact api.github.com (an optional host permission).
 */
export async function connectGitHub(
  input: { repo: string; branch: string; path: string; token: string },
  configStore: GitHubConfigStore = createGitHubConfigStore(),
  fetchFn: FetchFn = fetch,
): Promise<void> {
  const config: GitHubConfig = {
    repo: normalizeGitHubRepo(input.repo),
    branch: input.branch.trim(),
    path: normalizeGitHubPath(input.path),
    token: input.token.trim(),
  };
  if (!config.token) throw new Error('Enter a GitHub access token.');

  await requestHostPermission(['https://api.github.com/*'], 'GitHub');
  // Check the repository itself first: a missing file is fine, but a wrong repo or token is not.
  const response = await fetchFn(`https://api.github.com/repos/${config.repo}`, {
    headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    cache: 'no-store',
  });
  if (response.status === 401) throw new Error('GitHub rejected the access token.');
  if (response.status === 404) throw new Error('GitHub could not find that repository, or the token has no access to it.');
  if (!response.ok) throw new Error(`GitHub check failed (${response.status}).`);
  const repo = (await response.json()) as { permissions?: { push?: boolean } };
  if (repo.permissions && repo.permissions.push === false) throw new Error('The token can read this repository but not write to it.');

  await createGitHubClient(async () => config, fetchFn).download();
  await configStore.set(config);
}
