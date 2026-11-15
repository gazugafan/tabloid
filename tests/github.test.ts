import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import type { StoredState } from '../types/layout';
import { createGitHubClient } from '../utils/sync/github/client';
import { connectGitHub, createGitHubConfigStore, normalizeGitHubPath, normalizeGitHubRepo, type GitHubConfig } from '../utils/sync/github/config';
import { RemoteConflictError } from '../utils/sync/remote/types';
import { memoryStore } from './helpers';

const config: GitHubConfig = { repo: 'me/sync', branch: 'main', path: 'dir/tabloid.json', token: 'tok' };
const doc: StoredState = { version: 3, dashboards: [{ id: 'home', name: 'Home' }], preferences: {}, widgets: [{ id: 'a', dashboard: 'home', type: 'notes', x: 0, y: 0, w: 1, h: 1, config: { text: 'héllo ✓' } }] };
const getConfig = async () => config;
const b64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function server(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = { url: String(url), method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('github config helpers', () => {
  it('normalizes repositories and paths', () => {
    expect(normalizeGitHubRepo(' https://github.com/me/sync.git/ ')).toBe('me/sync');
    expect(normalizeGitHubRepo('me/sync')).toBe('me/sync');
    expect(() => normalizeGitHubRepo('nope')).toThrow(/owner\/name/);
    expect(normalizeGitHubPath('')).toBe('tabloid.json');
    expect(normalizeGitHubPath('/a/b.json')).toBe('a/b.json');
    expect(() => normalizeGitHubPath('a/../b')).toThrow();
  });
});

describe('github client', () => {
  it('downloads and decodes UTF-8 content, using the sha as the rev', async () => {
    const { calls, fetchFn } = server(() => json({ sha: 's1', encoding: 'base64', content: b64(JSON.stringify(doc)) }));
    expect(await createGitHubClient(getConfig, fetchFn).download()).toEqual({ state: doc, rev: 's1' });
    expect(calls[0]?.url).toBe('https://api.github.com/repos/me/sync/contents/dir/tabloid.json?ref=main');
    expect(calls[0]?.headers.Authorization).toBe('Bearer tok');
  });

  it('falls back to the raw body for large files', async () => {
    const { calls, fetchFn } = server((call) =>
      call.headers.Accept?.includes('raw') ? new Response(JSON.stringify(doc)) : json({ sha: 's2', encoding: 'none', content: '' }),
    );
    expect(await createGitHubClient(getConfig, fetchFn).download()).toEqual({ state: doc, rev: 's2' });
    expect(calls).toHaveLength(2);
  });

  it('treats 404 as no file, and explains bad tokens', async () => {
    expect(await createGitHubClient(getConfig, server(() => json({}, 404)).fetchFn).download()).toBeNull();
    await expect(createGitHubClient(getConfig, server(() => json({}, 401)).fetchFn).download()).rejects.toThrow(/rejected/);
  });

  it('uploads with the sha and branch, returning the new sha', async () => {
    const { calls, fetchFn } = server(() => json({ content: { sha: 's3' } }));
    expect(await createGitHubClient(getConfig, fetchFn).upload(doc, 's1')).toBe('s3');
    const body = JSON.parse(calls[0]!.body!);
    expect(calls[0]?.method).toBe('PUT');
    expect(body.sha).toBe('s1');
    expect(body.branch).toBe('main');
    expect(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0))))).toEqual(doc);
  });

  it('omits the sha for a new file and maps 409/422 to a conflict', async () => {
    const created = server(() => json({ content: { sha: 'n' } }));
    await createGitHubClient(getConfig, created.fetchFn).upload(doc);
    expect(JSON.parse(created.calls[0]!.body!).sha).toBeUndefined();
    for (const status of [409, 422]) {
      await expect(createGitHubClient(getConfig, server(() => json({}, status)).fetchFn).upload(doc, 'old')).rejects.toBeInstanceOf(RemoteConflictError);
    }
  });

  it('reports rate limiting', async () => {
    const limited = server(() => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }));
    await expect(createGitHubClient(getConfig, limited.fetchFn).download()).rejects.toThrow(/rate limit/);
  });
});

describe('connectGitHub', () => {
  beforeEach(() => {
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(true as never);
  });
  const input = { repo: 'me/sync', branch: '', path: '', token: ' tok ' };

  it('saves the config after the repo and file checks pass', async () => {
    const { fetchFn } = server((call) => (call.url.endsWith('/repos/me/sync') ? json({ permissions: { push: true } }) : json({}, 404)));
    const configStore = createGitHubConfigStore(memoryStore());
    await connectGitHub(input, configStore, fetchFn);
    expect(await configStore.get()).toEqual({ repo: 'me/sync', branch: '', path: 'tabloid.json', token: 'tok' });
  });

  it('rejects unknown repos and read-only tokens without saving', async () => {
    const configStore = createGitHubConfigStore(memoryStore());
    await expect(connectGitHub(input, configStore, server(() => json({}, 404)).fetchFn)).rejects.toThrow(/could not find/);
    await expect(connectGitHub(input, configStore, server(() => json({ permissions: { push: false } })).fetchFn)).rejects.toThrow(/not write/);
    expect(await configStore.get()).toBeUndefined();
  });
});
