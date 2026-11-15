import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../utils/sync/settings';
import { switchProvider } from '../utils/sync/manager';
import { createGitHubConfigStore } from '../utils/sync/github/config';
import { isRemoteProviderId, REMOTE_PROVIDERS } from '../utils/sync/providers';
import { SYNC_PROVIDER_IDS } from '../utils/sync/settings';
import type { StoredState } from '../types/layout';
import { memoryStore } from './helpers';

const widget = { id: 'a', dashboard: 'home', type: 'clock', x: 0, y: 0, w: 2, h: 2, config: {} };
const mine: StoredState = { version: 3, dashboards: [{ id: 'home', name: 'Home' }], widgets: [widget], preferences: {} };
const theirs: StoredState = { version: 3, dashboards: [{ id: 'home', name: 'Home' }], widgets: [{ ...widget, id: 'b' }], preferences: {} };

/** A tiny fake of GitHub's contents API holding one file. */
function fakeGitHub(initial?: StoredState) {
  let file = initial ? { sha: 's1', body: JSON.stringify(initial) } : null;
  const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(init.body as string);
      file = { sha: `s${Number(file?.sha.slice(1) ?? 0) + 1}`, body: new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0))) };
      return new Response(JSON.stringify({ content: { sha: file.sha } }));
    }
    if (!file) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ sha: file.sha, encoding: 'base64', content: btoa(String.fromCharCode(...new TextEncoder().encode(file.body))) }));
  });
  vi.stubGlobal('fetch', fetchFn);
  return { read: () => (file ? (JSON.parse(file.body) as StoredState) : null) };
}

async function device() {
  const local = memoryStore({ state: mine });
  await createGitHubConfigStore(local).set({ repo: 'me/sync', branch: '', path: 'tabloid.json', token: 't' });
  return local;
}

afterEach(() => vi.unstubAllGlobals());

describe('provider registry', () => {
  it('has an entry for every remote provider id', () => {
    for (const id of SYNC_PROVIDER_IDS) {
      expect(isRemoteProviderId(id)).toBe(id in REMOTE_PROVIDERS);
    }
    expect(Object.keys(REMOTE_PROVIDERS).sort()).toEqual(['dropbox', 'github', 'webdav']);
  });
});

describe('switchProvider', () => {
  it("uploads this device's layout when not keeping the remote", async () => {
    const github = fakeGitHub(theirs);
    const local = await device();
    await switchProvider('github', { keepRemote: false }, local);
    expect(github.read()?.widgets.map((w) => w.id)).toEqual(['a']);
    expect((await loadSettings(local)).syncProvider).toBe('github');
  });

  it('adopts the remote layout when keeping it', async () => {
    fakeGitHub(theirs);
    const local = await device();
    await switchProvider('github', { keepRemote: true }, local);
    const cached = local.data['github:state'] as StoredState;
    expect(cached.widgets.map((w) => w.id)).toEqual(['b']);
  });

  it('keeps the old provider and reports the error when the remote fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const local = await device();
    await expect(switchProvider('github', { keepRemote: true }, local)).rejects.toThrow(/rejected/);
    expect((await loadSettings(local)).syncProvider).toBe('none');
  });

  it('preserves unknown settings fields when saving', async () => {
    fakeGitHub();
    const local = await device();
    local.data.settings = { version: 1, syncProvider: 'none', futureField: 7 };
    await switchProvider('github', { keepRemote: false }, local);
    expect(local.data.settings).toMatchObject({ syncProvider: 'github', futureField: 7 });
  });
});
