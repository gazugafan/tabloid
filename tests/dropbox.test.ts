import { describe, expect, it, vi } from 'vitest';
import type { StoredState } from '../types/layout';
import { buildAuthUrl, codeChallenge, createAuthStore, DROPBOX_APP_KEY, getAccessToken } from '../utils/sync/dropbox/auth';
import { createDropboxClient } from '../utils/sync/dropbox/client';
import { createRemoteRepository } from '../utils/sync/remote/repository';
import { RemoteConflictError, type RemoteFileClient } from '../utils/sync/remote/types';
import { memoryStore } from './helpers';

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), init);
const state = (ids: string[]): StoredState => ({
  version: 3, dashboards: [{ id: 'home', name: 'Home' }],
  preferences: {},
  widgets: ids.map((id) => ({ id, dashboard: 'home', type: 'clock', x: 0, y: 0, w: 2, h: 2, config: {} })),
});

async function authedStore(expiresAt = Date.now() + 3_600_000) {
  const store = createAuthStore(memoryStore());
  await store.set({ accessToken: 'old', refreshToken: 'refresh', expiresAt });
  return store;
}

describe('dropbox auth', () => {
  it('derives the PKCE challenge from the RFC 7636 example', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('builds an offline, S256 authorization URL without any secret', () => {
    const url = new URL(buildAuthUrl({ redirectUri: 'https://x.test/cb', challenge: 'abc', state: 's1' }));
    expect(url.searchParams.get('client_id')).toBe(DROPBOX_APP_KEY);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('token_access_type')).toBe('offline');
    expect(url.search).not.toMatch(/secret/i);
  });

  it('reuses a valid token and refreshes an expired one', async () => {
    const fetchFn = vi.fn(async () => json({ access_token: 'new', expires_in: 14400 }));
    expect(await getAccessToken(await authedStore(), fetchFn)).toBe('old');
    expect(fetchFn).not.toHaveBeenCalled();

    const expired = await authedStore(Date.now() - 1000);
    expect(await getAccessToken(expired, fetchFn)).toBe('new');
    expect((await expired.get())?.refreshToken).toBe('refresh');
    const body = String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).not.toContain('client_secret');
  });

  it('reports the Dropbox error detail and forgets credentials that were revoked', async () => {
    const detail = vi.fn(async () => json({ error: 'invalid_request', error_description: 'bad' }, { status: 400 }));
    await expect(getAccessToken(await authedStore(Date.now() - 1000), detail)).rejects.toThrow(/400, invalid_request: bad/);

    const revoked = vi.fn(async () => json({ error: 'invalid_grant' }, { status: 400 }));
    const store = await authedStore(Date.now() - 1000);
    await expect(getAccessToken(store, revoked)).rejects.toThrow(/Reconnect Dropbox/);
    expect(await store.get()).toBeUndefined();
  });

  it('fails when not connected', async () => {
    await expect(getAccessToken(createAuthStore(memoryStore()))).rejects.toThrow(/Not connected/);
  });
});

describe('dropbox client', () => {
  it('downloads state with its revision, and returns null when the file is missing', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(state(['a'])), { headers: { 'dropbox-api-result': '{"rev":"r1"}' } }));
    expect(await createDropboxClient(await authedStore(), ok).download()).toEqual({ state: state(['a']), rev: 'r1' });

    const missing = vi.fn(async () => json({ error_summary: 'path/not_found/..' }, { status: 409 }));
    expect(await createDropboxClient(await authedStore(), missing).download()).toBeNull();
  });

  it('refreshes the token and retries once on 401', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('oauth2/token')) return json({ access_token: 'fresh', expires_in: 14400 });
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer fresh'
        ? new Response('{}', { headers: { 'dropbox-api-result': '{"rev":"r2"}' } })
        : new Response('expired', { status: 401 });
    });
    expect((await createDropboxClient(await authedStore(), fetchFn).download())?.rev).toBe('r2');
    expect(calls.filter((u) => u.includes('download'))).toHaveLength(2);
  });

  it('uploads in update mode and signals a conflict', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const arg = JSON.parse((init?.headers as Record<string, string>)['Dropbox-API-Arg'] ?? '{}');
      return arg.mode.update === 'stale' ? json({ error_summary: 'path/conflict/file/..' }, { status: 409 }) : json({ rev: 'r3' });
    });
    const client = createDropboxClient(await authedStore(), fetchFn);
    expect(await client.upload(state(['a']), 'current')).toBe('r3');
    await expect(client.upload(state(['a']), 'stale')).rejects.toBeInstanceOf(RemoteConflictError);
  });
});

function fakeClient(initial: { state: StoredState; rev: string } | null = null) {
  let remote = initial;
  let counter = initial ? Number(initial.rev.slice(1)) : 0;
  const client: RemoteFileClient & { remote: () => typeof remote; uploads: number } = {
    uploads: 0,
    remote: () => remote,
    async download() {
      return remote ? { state: remote.state, rev: remote.rev } : null;
    },
    async upload(next, rev) {
      if (remote && rev !== remote.rev) throw new RemoteConflictError();
      if (!remote && rev) throw new RemoteConflictError();
      client.uploads++;
      remote = { state: next, rev: `r${++counter}` };
      return remote.rev;
    },
  };
  return client;
}

describe('dropbox repository', () => {
  it('seeds Dropbox from this device when the remote file does not exist', async () => {
    const client = fakeClient();
    const repo = createRemoteRepository(client, memoryStore(), 'dropbox');
    await repo.save(state(['a']));
    expect(client.remote()?.state).toEqual(state(['a']));
    expect(repo.getError()).toBeNull();
  });

  it('adopts a newer remote file when there are no local changes', async () => {
    const cache = memoryStore();
    const client = fakeClient();
    const repo = createRemoteRepository(client, cache, 'dropbox');
    await repo.save(state(['a']));
    await client.upload(state(['a', 'b']), client.remote()!.rev); // another device
    await repo.pull();
    expect(await repo.load()).toEqual(state(['a', 'b']));
  });

  it('lets unsent local changes overwrite a newer remote file', async () => {
    const client = fakeClient({ state: state(['remote']), rev: 'r1' });
    const repo = createRemoteRepository(client, memoryStore(), 'dropbox');
    await repo.pull();
    // Go offline: uploads fail while we edit.
    const upload = client.upload;
    client.upload = async () => { throw new Error('offline'); };
    await repo.save(state(['remote', 'local']));
    expect(repo.getError()).toBe('offline');

    client.upload = upload;
    await client.upload(state(['other-device']), 'r1'); // remote moves on meanwhile
    await repo.pull();
    expect(client.remote()?.state).toEqual(state(['remote', 'local']));
    expect(repo.getError()).toBeNull();
  });

  it('recovers from an upload conflict by overwriting', async () => {
    const client = fakeClient({ state: state(['a']), rev: 'r1' });
    const repo = createRemoteRepository(client, memoryStore(), 'dropbox');
    await repo.pull();
    await client.upload(state(['x']), 'r1'); // remote changes behind our back
    await repo.save(state(['mine']));
    expect(client.remote()?.state).toEqual(state(['mine']));
  });

  it('does not re-upload when nothing changed', async () => {
    const client = fakeClient({ state: state(['a']), rev: 'r1' });
    const repo = createRemoteRepository(client, memoryStore(), 'dropbox');
    await repo.pull();
    await repo.pull();
    expect(client.uploads).toBe(0);
  });

  it('keeps changes locally and reports the error when offline', async () => {
    const client = fakeClient();
    client.upload = async () => { throw new Error('network down'); };
    const repo = createRemoteRepository(client, memoryStore(), 'dropbox');
    await repo.save(state(['a']));
    expect(await repo.load()).toEqual(state(['a']));
    expect(repo.getError()).toBe('network down');
  });
});
