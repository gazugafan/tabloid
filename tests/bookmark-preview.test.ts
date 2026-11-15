import { describe, expect, it, vi } from 'vitest';
import { findPreviewImage, loadPreviewImage, PREVIEW_RECHECK_MS, PREVIEW_RETRY_MS } from '../components/widgets/bookmarks/preview';
import type { KeyValueStore } from '../utils/storage/store';

function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => data.get(key) as T | undefined,
    getMany: async () => ({}),
    set: async (key, value) => void data.set(key, value),
    setMany: async () => undefined,
    remove: async (key) => void data.delete(key),
    removeMany: async () => undefined,
    subscribe: () => () => undefined,
  };
}

describe('findPreviewImage', () => {
  const page = 'https://site.test/a/b';
  it('prefers Open Graph, resolves relative addresses and decodes entities', () => {
    const html = `<meta name="twitter:image" content="/tw.png"><meta property="og:image" content="/img/x.png?a=1&amp;b=2">`;
    expect(findPreviewImage(html, page)).toBe('https://site.test/img/x.png?a=1&b=2');
  });
  it('falls back to the Twitter image, and ignores unsafe or missing ones', () => {
    expect(findPreviewImage(`<meta content='https://cdn.test/t.jpg' name='twitter:image'>`, page)).toBe('https://cdn.test/t.jpg');
    expect(findPreviewImage(`<meta property="og:image" content="javascript:alert(1)">`, page)).toBeUndefined();
    expect(findPreviewImage('<title>none</title>', page)).toBeUndefined();
  });
});

describe('loadPreviewImage', () => {
  it('fetches once, then answers from the cache until it is old', async () => {
    const store = memoryStore();
    const fetchHtml = vi.fn().mockResolvedValue('<meta property="og:image" content="https://i.test/p.png">');
    let now = 1_000;
    const deps = { store, fetchHtml, now: () => now };
    expect(await loadPreviewImage('https://one.test/', deps)).toBe('https://i.test/p.png');
    now += 1000;
    expect(await loadPreviewImage('https://one.test/', deps)).toBe('https://i.test/p.png');
    expect(fetchHtml).toHaveBeenCalledTimes(1);
    now += PREVIEW_RECHECK_MS;
    await loadPreviewImage('https://one.test/', deps);
    expect(fetchHtml).toHaveBeenCalledTimes(2);
  });

  it('remembers pages without an image for a day, and tries again later', async () => {
    const store = memoryStore();
    const fetchHtml = vi.fn().mockResolvedValue('<html></html>');
    let now = 1_000;
    const deps = { store, fetchHtml, now: () => now };
    expect(await loadPreviewImage('https://two.test/', deps)).toBeUndefined();
    await loadPreviewImage('https://two.test/', deps);
    expect(fetchHtml).toHaveBeenCalledTimes(1);
    now += PREVIEW_RETRY_MS;
    await loadPreviewImage('https://two.test/', deps);
    expect(fetchHtml).toHaveBeenCalledTimes(2);
  });

  it('never throws, and keeps an older image when the page cannot be reached', async () => {
    const store = memoryStore();
    const ok = vi.fn().mockResolvedValue('<meta property="og:image" content="https://i.test/p.png">');
    let now = 1_000;
    await loadPreviewImage('https://three.test/', { store, fetchHtml: ok, now: () => now });
    now += PREVIEW_RECHECK_MS;
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await loadPreviewImage('https://three.test/', { store, fetchHtml: failing, now: () => now })).toBe('https://i.test/p.png');
    expect(await loadPreviewImage('https://four.test/', { store, fetchHtml: failing, now: () => now })).toBeUndefined();
  });
});
