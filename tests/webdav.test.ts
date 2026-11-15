import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import type { StoredState } from '../types/layout';
import { RemoteConflictError } from '../utils/sync/remote/types';
import { createWebDavClient } from '../utils/sync/webdav/client';
import { createWebDavConfigStore, connectWebDav, isInsecureWebDavUrl, normalizeWebDavUrl, type WebDavConfig } from '../utils/sync/webdav/config';
import { memoryStore } from './helpers';

const config: WebDavConfig = { url: 'https://dav.test/files/me/Tabloid/', username: 'me', password: 'p@ss wörd' };
const doc: StoredState = { version: 3, dashboards: [{ id: 'home', name: 'Home' }], preferences: {}, widgets: [] };
const getConfig = async () => config;

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

describe('normalizeWebDavUrl', () => {
  it('adds a trailing slash and strips query and hash', () => {
    expect(normalizeWebDavUrl(' https://a.test/dav/x?y=1#z ')).toBe('https://a.test/dav/x/');
    expect(normalizeWebDavUrl('https://a.test/dav/')).toBe('https://a.test/dav/');
  });
  it('rejects non-URLs and other schemes', () => {
    expect(() => normalizeWebDavUrl('nope')).toThrow(/full WebDAV/);
    expect(() => normalizeWebDavUrl('ftp://a.test/')).toThrow(/https/);
  });
  it('flags unencrypted addresses', () => {
    expect(isInsecureWebDavUrl('http://nas.local/dav')).toBe(true);
    expect(isInsecureWebDavUrl('https://nas.local/dav')).toBe(false);
  });
});

describe('webdav client', () => {
  it('sends UTF-8 basic auth and returns the state with its ETag', async () => {
    const { calls, fetchFn } = server(() => new Response(JSON.stringify(doc), { headers: { etag: '"abc"' } }));
    expect(await createWebDavClient(getConfig, fetchFn).download()).toEqual({ state: doc, rev: '"abc"' });
    expect(calls[0]?.url).toBe('https://dav.test/files/me/Tabloid/tabloid.json');
    const expected = `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode('me:p@ss wörd')))}`;
    expect(calls[0]?.headers.Authorization).toBe(expected);
  });

  it('treats 404 as "no file yet" and explains rejected credentials', async () => {
    const missing = server(() => new Response('', { status: 404 }));
    expect(await createWebDavClient(getConfig, missing.fetchFn).download()).toBeNull();
    const denied = server(() => new Response('', { status: 401 }));
    await expect(createWebDavClient(getConfig, denied.fetchFn).download()).rejects.toThrow(/username or password/);
  });

  it('requires an ETag', async () => {
    const { fetchFn } = server(() => new Response(JSON.stringify(doc)));
    await expect(createWebDavClient(getConfig, fetchFn).download()).rejects.toThrow(/ETag/);
  });

  it('uploads conditionally: If-None-Match for a new file, If-Match for an update', async () => {
    const { calls, fetchFn } = server(() => new Response('', { status: 201, headers: { etag: '"n"' } }));
    const client = createWebDavClient(getConfig, fetchFn);
    expect(await client.upload(doc)).toBe('"n"');
    expect(calls[0]?.headers['If-None-Match']).toBe('*');
    await client.upload(doc, '"old"');
    expect(calls[1]?.headers['If-Match']).toBe('"old"');
    expect(calls[1]?.method).toBe('PUT');
  });

  it('reports a precondition failure as a conflict', async () => {
    const { fetchFn } = server(() => new Response('', { status: 412 }));
    await expect(createWebDavClient(getConfig, fetchFn).upload(doc, '"stale"')).rejects.toBeInstanceOf(RemoteConflictError);
  });

  it('creates the folder when it does not exist, then retries', async () => {
    let folderExists = false;
    const { calls, fetchFn } = server((call) => {
      if (call.method === 'MKCOL') { folderExists = true; return new Response('', { status: 201 }); }
      return folderExists ? new Response('', { status: 201, headers: { etag: '"1"' } }) : new Response('', { status: 409 });
    });
    expect(await createWebDavClient(getConfig, fetchFn).upload(doc)).toBe('"1"');
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'MKCOL', 'PUT']);
  });

  it('falls back to reading the ETag when PUT returns none', async () => {
    const { calls, fetchFn } = server((call) =>
      call.method === 'PUT' ? new Response('', { status: 204 }) : new Response(JSON.stringify(doc), { headers: { etag: '"g"' } }),
    );
    expect(await createWebDavClient(getConfig, fetchFn).upload(doc, '"x"')).toBe('"g"');
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'GET']);
  });
});

describe('connectWebDav', () => {
  afterEach(() => vi.restoreAllMocks());
  const allow = (granted = true) => vi.spyOn(browser.permissions, 'request').mockResolvedValue(granted as never);

  it('saves the normalized config after a successful check', async () => {
    const request = allow();
    const store = createWebDavConfigStore(memoryStore());
    const { fetchFn } = server(() => new Response('', { status: 404 }));
    await connectWebDav({ url: 'https://dav.test/x', username: ' me ', password: 'pw' }, store, fetchFn);
    expect(await store.get()).toEqual({ url: 'https://dav.test/x/', username: 'me', password: 'pw' });
    expect(request).toHaveBeenCalledWith({ origins: ['https://dav.test/*'] });
  });

  it('does not contact the server when the permission is declined', async () => {
    allow(false);
    const store = createWebDavConfigStore(memoryStore());
    const { fetchFn, calls } = server(() => new Response('', { status: 404 }));
    await expect(connectWebDav({ url: 'https://dav.test/x', username: 'me', password: 'pw' }, store, fetchFn)).rejects.toThrow(/declined/);
    expect(calls).toHaveLength(0);
    expect(await store.get()).toBeUndefined();
  });

  it('does not save when the server rejects the credentials', async () => {
    allow();
    const store = createWebDavConfigStore(memoryStore());
    const { fetchFn } = server(() => new Response('', { status: 401 }));
    await expect(connectWebDav({ url: 'https://dav.test/x', username: 'me', password: 'bad' }, store, fetchFn)).rejects.toThrow(/rejected/);
    expect(await store.get()).toBeUndefined();
  });
});
