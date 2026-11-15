import { describe, expect, it, vi } from 'vitest';
import { collectScreenshotLinks } from '../utils/screenshots/links';
import { captureIfWanted, MIN_RECAPTURE_MS, type CaptureDeps, type TabInfo } from '../utils/screenshots/capture';
import { pageKey, screenshotStoreKey } from '../utils/screenshots/keys';
import { createWantedScreenshots } from '../utils/screenshots/store';
import type { WidgetInstance } from '../types/layout';
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

describe('pageKey', () => {
  it('ignores scheme, www, query, fragment and trailing slashes', () => {
    expect(pageKey('https://www.Example.com/a/b/?x=1#top')).toBe('example.com/a/b');
    expect(pageKey('http://example.com/')).toBe('example.com');
    expect(pageKey('https://example.com:8080/x')).toBe('example.com:8080/x');
  });
  it('has no key for other schemes, logins or junk', () => {
    expect(pageKey('chrome://newtab')).toBeUndefined();
    expect(pageKey('https://user:pw@example.com/')).toBeUndefined();
    expect(pageKey('nope')).toBeUndefined();
    expect(pageKey(undefined)).toBeUndefined();
  });
});

describe('collectScreenshotLinks', () => {
  const widget = (config: Record<string, unknown>, type = 'bookmarks'): WidgetInstance => ({ id: crypto.randomUUID(), dashboard: 'home', type, x: 0, y: 0, w: 4, h: 4, config });
  const links = [{ id: '1', title: 'A', url: 'https://a.test/' }];
  it('collects only links of widgets set to screenshots (and not in the list layout)', () => {
    expect(
      collectScreenshotLinks([
        widget({ links, display: 'screenshot', layout: 'large' }),
        widget({ links: [{ id: '2', title: 'B', url: 'https://b.test/' }], display: 'screenshot', layout: 'list' }),
        widget({ links: [{ id: '3', title: 'C', url: 'https://c.test/' }], display: 'preview' }),
        widget({ links, display: 'screenshot' }, 'notes'),
      ]),
    ).toEqual(['https://a.test/']);
  });
});

describe('wanted screenshots', () => {
  it('stores addresses and answers with page keys', async () => {
    const wanted = createWantedScreenshots(memoryStore());
    await wanted.set(['https://www.a.test/x/', 'https://a.test/x/']);
    expect([...(await wanted.keys())]).toEqual(['a.test/x']);
  });
});

describe('captureIfWanted', () => {
  const tab: TabInfo = { id: 7, windowId: 1, url: 'https://a.test/x?y=1', active: true, incognito: false, status: 'complete' };

  function setup(overrides: Partial<CaptureDeps> = {}) {
    const stored = new Map<string, Blob>();
    let now = 10_000_000;
    const deps: CaptureDeps = {
      wanted: async () => new Set(['a.test/x']),
      hasAccess: async () => true,
      getTab: async () => tab,
      capture: vi.fn().mockResolvedValue('data:image/jpeg;base64,/9j/'),
      make: async (blob) => blob,
      images: { get: async (k) => stored.get(k), put: async (k, b) => void stored.set(k, b) },
      meta: memoryStore(),
      now: () => now,
      delay: async () => undefined,
      ...overrides,
    };
    return { deps, stored, advance: (ms: number) => (now += ms) };
  }

  it('saves a screenshot of a wanted page the user is looking at', async () => {
    const { deps, stored } = setup();
    expect(await captureIfWanted(tab, deps)).toBe(true);
    expect(deps.capture).toHaveBeenCalledWith({ windowId: 1, tabId: 7 });
    expect(stored.has(screenshotStoreKey('a.test/x'))).toBe(true);
  });

  it('skips pages nobody linked to, background tabs, private windows and unfinished loads', async () => {
    const { deps } = setup();
    expect(await captureIfWanted({ ...tab, url: 'https://other.test/' }, deps)).toBe(false);
    expect(await captureIfWanted({ ...tab, active: false }, deps)).toBe(false);
    expect(await captureIfWanted({ ...tab, incognito: true }, deps)).toBe(false);
    expect(await captureIfWanted({ ...tab, status: 'loading' }, deps)).toBe(false);
    expect(deps.capture).not.toHaveBeenCalled();
  });

  it('does nothing without permission', async () => {
    const { deps } = setup({ hasAccess: async () => false });
    expect(await captureIfWanted(tab, deps)).toBe(false);
    expect(deps.capture).not.toHaveBeenCalled();
  });

  it('does not capture again within the interval, but does afterwards', async () => {
    const { deps, advance } = setup();
    expect(await captureIfWanted(tab, deps)).toBe(true);
    expect(await captureIfWanted(tab, deps)).toBe(false);
    advance(MIN_RECAPTURE_MS);
    expect(await captureIfWanted(tab, deps)).toBe(true);
  });

  it('gives up if the user left the page while it settled', async () => {
    const { deps } = setup({ getTab: async () => ({ ...tab, url: 'https://elsewhere.test/' }) });
    expect(await captureIfWanted(tab, deps)).toBe(false);
    expect(deps.capture).not.toHaveBeenCalled();
  });

  it('never throws when the browser refuses to capture', async () => {
    const { deps } = setup({ capture: vi.fn().mockRejectedValue(new Error('Cannot access contents of the page')) });
    expect(await captureIfWanted(tab, deps)).toBe(false);
  });
});
