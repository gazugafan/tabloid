import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutStore } from '../stores/layout';
import { createSingleKeyRepository, createSplitRepository } from '../utils/storage/repository';
import { createDefaultStore } from '../utils/storage/store';
import { memoryStore } from './helpers';

const repoFor = (backing = memoryStore()) => createSingleKeyRepository(backing);

async function freshStore(backing = memoryStore()) {
  setActivePinia(createPinia());
  const store = useLayoutStore();
  await store.init(repoFor(backing));
  return store;
}

describe('layout store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts empty when nothing is stored', async () => {
    const store = await freshStore();
    expect(store.loaded).toBe(true);
    expect(store.widgets).toEqual([]);
  });

  it('adds widgets at the bottom with registry defaults and persists them', async () => {
    const backing = memoryStore();
    const store = await freshStore(backing);
    const a = store.addWidget('clock')!;
    const b = store.addWidget('notes')!;
    expect(b.y).toBe(a.y + a.h);
    expect(store.addWidget('nope')).toBeUndefined();
    await store.saveNow();
    expect((backing.data.state as { widgets: unknown[] }).widgets).toHaveLength(2);
  });

  it('round-trips through export and import', async () => {
    const store = await freshStore();
    const w = store.addWidget('notes')!;
    store.updateConfig(w.id, { text: 'hello' });
    const json = store.exportJson();

    const other = await freshStore();
    await other.importJson(json);
    expect(other.widgets).toEqual(store.widgets);
  });

  it('keeps current state when an import is invalid', async () => {
    const store = await freshStore();
    store.addWidget('clock');
    await expect(store.importJson('{"version": 999}')).rejects.toThrow();
    await expect(store.importJson('not json')).rejects.toThrow();
    expect(store.widgets).toHaveLength(1);
  });

  it('never overwrites unreadable stored data', async () => {
    const backing = memoryStore({ state: { version: 999, widgets: [] } });
    const store = await freshStore(backing);
    expect(store.loadError).toMatch(/newer/);
    store.addWidget('clock');
    await store.saveNow();
    expect(backing.data.state).toEqual({ version: 999, widgets: [] });
  });

  it('updates geometry and removes widgets', async () => {
    const store = await freshStore();
    const w = store.addWidget('clock')!;
    store.updateGeometry([{ id: w.id, x: 5, y: 1, w: 4, h: 2 }]);
    expect(store.widgets[0]).toMatchObject({ x: 5, y: 1, w: 4, h: 2 });
    store.removeWidget(w.id);
    expect(store.widgets).toEqual([]);
  });

  it('reorders via the shared layout and ignores no-op orders', async () => {
    const store = await freshStore();
    const a = store.addWidget('clock')!;
    const b = store.addWidget('notes')!;
    const before = store.revision;
    store.reorder([a.id, b.id]);
    expect(store.revision).toBe(before);
    store.reorder([b.id, a.id]);
    const sorted = [...store.widgets].sort((p, q) => p.y - q.y || p.x - q.x).map((w) => w.id);
    expect(sorted).toEqual([b.id, a.id]);
  });
});

describe('live updates between tabs', () => {
  beforeEach(() => vi.useFakeTimers());

  it('applies a change saved by another tab', async () => {
    const backing = memoryStore();
    setActivePinia(createPinia());
    const a = useLayoutStore();
    await a.init(repoFor(backing));
    setActivePinia(createPinia());
    const b = useLayoutStore();
    await b.init(repoFor(backing));

    a.addWidget('clock');
    await a.saveNow();
    await vi.advanceTimersByTimeAsync(200);
    expect(b.widgets).toHaveLength(1);
    expect(b.widgets[0]?.id).toBe(a.widgets[0]?.id);
    a.dispose();
    b.dispose();
  });

  it('keeps unsaved local edits over an incoming change', async () => {
    const backing = memoryStore();
    setActivePinia(createPinia());
    const a = useLayoutStore();
    await a.init(repoFor(backing));
    setActivePinia(createPinia());
    const b = useLayoutStore();
    await b.init(repoFor(backing));

    b.addWidget('notes'); // pending save in b
    a.addWidget('clock');
    await a.saveNow();
    await vi.advanceTimersByTimeAsync(100);
    expect(b.widgets.map((w) => w.type)).toEqual(['notes']);
    a.dispose();
    b.dispose();
  });
});

describe('browser-sync repository', () => {
  const policy = {
    syncsConfig: (type: string) => type !== 'notes',
    defaultConfig: () => ({}),
  };
  const widget = (id: string, type: string, config = {}) => ({ id, dashboard: 'home', type, x: 0, y: 0, w: 2, h: 2, config });

  it('keeps local-only configs off the synced store and round-trips', async () => {
    const sync = memoryStore();
    const local = memoryStore();
    const repo = createSplitRepository(sync, local, policy);
    await repo.save({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], preferences: {}, widgets: [widget('c', 'clock', { hour12: true }), widget('n', 'notes', { text: 'secret' })] });

    expect(JSON.stringify(sync.data)).not.toContain('secret');
    expect(JSON.stringify(local.data)).toContain('secret');
    expect((await repo.load())?.widgets).toEqual([widget('c', 'clock', { hour12: true }), widget('n', 'notes', { text: 'secret' })]);
  });

  it('shows the widget but a default config on a device without the local config', async () => {
    const sync = memoryStore();
    await createSplitRepository(sync, memoryStore(), policy).save({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], preferences: {}, widgets: [widget('n', 'notes', { text: 'x' })] });
    const other = await createSplitRepository(sync, memoryStore(), policy).load();
    expect(other?.widgets).toEqual([widget('n', 'notes', {})]);
  });

  it('removes items for deleted widgets and skips unchanged writes', async () => {
    const sync = memoryStore();
    const repo = createSplitRepository(sync, memoryStore(), policy);
    await repo.save({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], preferences: {}, widgets: [widget('a', 'clock'), widget('b', 'clock')] });
    expect(Object.keys(sync.data).sort()).toEqual(['dashboards', 'index', 'prefs', 'w:a', 'w:b']);

    const seen: string[][] = [];
    sync.subscribe((keys) => seen.push(keys));
    await repo.save({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], preferences: {}, widgets: [widget('a', 'clock')] });
    expect(Object.keys(sync.data).sort()).toEqual(['dashboards', 'index', 'prefs', 'w:a']);
    expect(seen.flat()).not.toContain('w:a');
  });

  it('refuses items over the per-item quota', async () => {
    const repo = createSplitRepository(memoryStore(), memoryStore(), policy);
    await expect(repo.save({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], preferences: {}, widgets: [widget('a', 'clock', { big: 'x'.repeat(9000) })] })).rejects.toThrow(/too large/);
  });

  it('returns undefined when nothing has been synced', async () => {
    expect(await createSplitRepository(memoryStore(), memoryStore(), policy).load()).toBeUndefined();
  });
});

describe('preferences', () => {
  it('persist with the layout and survive browser sync', async () => {
    const sync = memoryStore();
    const repo = createSplitRepository(sync, memoryStore(), { syncsConfig: () => true, defaultConfig: () => ({}) });
    setActivePinia(createPinia());
    const store = useLayoutStore();
    await store.init(repo);
    store.setPreference('appearance', { radius: 12 });
    await store.saveNow();
    expect((await repo.load())?.preferences).toEqual({ appearance: { radius: 12 } });
    expect(sync.data.prefs).toEqual({ appearance: { radius: 12 } });
    store.dispose();
  });
});

describe('local-only preferences in browser sync', () => {
  it('keeps flagged sections on this device and merges them back on load', async () => {
    const sync = memoryStore();
    const local = memoryStore();
    const repo = createSplitRepository(sync, local, {
      syncsConfig: () => true,
      defaultConfig: () => ({}),
      syncsPreference: (key) => key !== 'big',
    });
    await repo.save({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], widgets: [], preferences: { appearance: { radius: 4 }, big: { ids: ['a'] } } });
    expect(sync.data.prefs).toEqual({ appearance: { radius: 4 } });
    expect(local.data.localPrefs).toEqual({ big: { ids: ['a'] } });
    expect((await repo.load())?.preferences).toEqual({ appearance: { radius: 4 }, big: { ids: ['a'] } });
  });
});

describe('removing and restoring widgets', () => {
  it('returns the removed widget and puts it back in the same place, once', async () => {
    const store = await freshStore();
    const a = store.addWidget('clock')!;
    const b = store.addWidget('notes')!;
    store.updateConfig(b.id, { text: 'precious' });
    const c = store.addWidget('clock')!;
    const removed = store.removeWidget(b.id)!;
    expect(store.widgets.map((w) => w.id)).toEqual([a.id, c.id]);
    expect(removed.index).toBe(1);
    store.restoreWidget(removed.widget, removed.index);
    store.restoreWidget(removed.widget, removed.index); // A second Undo click changes nothing.
    expect(store.widgets.map((w) => w.id)).toEqual([a.id, b.id, c.id]);
    expect(store.widgets[1]?.config).toEqual({ text: 'precious' });
    expect(store.removeWidget('missing')).toBeUndefined();
  });
});

describe('extension storage and reactive data', () => {
  it('hands the browser plain data, not Vue proxies (Firefox cannot clone proxies)', async () => {
    const { reactive, isReactive } = await import('vue');
    const { browser } = await import('wxt/browser');
    const { createExtensionStore } = await import('../utils/storage/store');
    const set = vi.spyOn(browser.storage.local, 'set').mockResolvedValue(undefined as never);
    const store = createExtensionStore('local');
    await store.set('k', reactive({ nested: { list: [1, 2] } }));
    await store.setMany({ other: reactive({ a: { b: 1 } }) });
    for (const [items] of set.mock.calls) {
      for (const value of Object.values(items as Record<string, unknown>)) {
        expect(isReactive(value)).toBe(false);
        expect(JSON.stringify(value)).toMatch(/nested|"a"/);
      }
    }
    expect(set.mock.calls[0]![0]).toEqual({ k: { nested: { list: [1, 2] } } });
    set.mockRestore();
  });
});

describe('transparent widgets', () => {
  it('can be switched on and off, persist, and survive reloads', async () => {
    const backing = memoryStore();
    const store = await freshStore(backing);
    const w = store.addWidget('notes')!;
    store.setTransparent(w.id, true);
    await store.saveNow();
    expect((backing.data.state as { widgets: Array<{ transparent?: boolean }> }).widgets[0]?.transparent).toBe(true);
    const again = await freshStore(backing);
    expect(again.widgets[0]?.transparent).toBe(true);
    again.setTransparent(w.id, false);
    await again.saveNow();
    expect('transparent' in (backing.data.state as { widgets: object[] }).widgets[0]!).toBe(false);
  });

  it('is kept by browser sync, even for widgets whose config stays on the device', async () => {
    const repo = createSplitRepository(memoryStore(), memoryStore(), { syncsConfig: () => false, defaultConfig: () => ({}) });
    await repo.save({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], preferences: {}, widgets: [{ id: 'a', dashboard: 'home', type: 'notes', x: 0, y: 0, w: 2, h: 2, config: { text: 'x' }, transparent: true }] });
    expect((await repo.load())?.widgets[0]).toMatchObject({ transparent: true, config: { text: 'x' } });
  });
});

describe('dashboards', () => {
  it('starts with one Home dashboard and puts new widgets on the one being shown', async () => {
    const store = await freshStore();
    expect(store.dashboards.map((d) => d.name)).toEqual(['Home']);
    const a = store.addWidget('clock')!;
    const news = store.addDashboard('News')!;
    expect(store.activeId).toBe(news.id);
    expect(store.activeWidgets).toEqual([]);
    const b = store.addWidget('notes')!;
    expect(b.dashboard).toBe(news.id);
    expect(b.y).toBe(0); // Stacked within its own dashboard, not below the Home widgets.
    expect(store.activeWidgets.map((w) => w.id)).toEqual([b.id]);
    store.setActive(store.dashboards[0]!.id);
    expect(store.activeWidgets.map((w) => w.id)).toEqual([a.id]);
  });

  it('remembers the dashboard last shown on this device, and falls back if it is gone', async () => {
    const backing = memoryStore();
    const store = await freshStore(backing);
    const second = store.addDashboard('Second')!;
    await store.saveNow();
    await vi.waitFor(async () => expect(await createDefaultStore().get('ui:activeDashboard')).toBe(second.id));
    const again = await freshStore(backing);
    expect(again.activeId).toBe(second.id);
    await createDefaultStore().set('ui:activeDashboard', 'deleted-elsewhere');
    const fallback = await freshStore(backing);
    expect(fallback.activeId).toBe(fallback.dashboards[0]!.id);
  });

  it('renames with tidy names, moves, and limits the count', async () => {
    const store = await freshStore();
    const a = store.dashboards[0]!;
    const b = store.addDashboard()!;
    expect(b.name).toBe('Dashboard 2');
    store.renameDashboard(a.id, '  Work   stuff ');
    expect(a.name).toBe('Work stuff');
    store.renameDashboard(a.id, '   ');
    expect(a.name).toBe('Work stuff'); // An empty name changes nothing.
    store.moveDashboard(b.id, 0);
    expect(store.dashboards.map((d) => d.id)).toEqual([b.id, a.id]);
    store.moveDashboard(b.id, 99);
    expect(store.dashboards.map((d) => d.id)).toEqual([a.id, b.id]);
    for (let i = 0; i < 40; i++) store.addDashboard();
    expect(store.dashboards).toHaveLength(20);
    expect(store.addDashboard()).toBeUndefined();
  });

  it('deletes a dashboard with its widgets, can bring it back, and never deletes the last one', async () => {
    const store = await freshStore();
    const home = store.dashboards[0]!;
    store.addWidget('clock');
    const other = store.addDashboard('Other')!;
    const w = store.addWidget('notes')!;
    expect(store.removeDashboard(other.id)).toBeDefined();
    expect(store.activeId).toBe(home.id);
    expect(store.widgets.some((x) => x.id === w.id)).toBe(false);
    const removed = { dashboard: other, index: 1, widgets: [w] };
    store.restoreDashboard(removed);
    store.restoreDashboard(removed); // Twice: nothing doubles.
    expect(store.dashboards.map((d) => d.id)).toEqual([home.id, other.id]);
    expect(store.widgets.filter((x) => x.id === w.id)).toHaveLength(1);
    expect(store.activeId).toBe(other.id);
    store.removeDashboard(other.id);
    expect(store.removeDashboard(home.id)).toBeUndefined();
    expect(store.dashboards).toHaveLength(1);
  });

  it('keeps a dashboard\'s own background and saves everything with the layout', async () => {
    const backing = memoryStore();
    const store = await freshStore(backing);
    const d = store.addDashboard('Photos')!;
    store.setDashboardBackground(d.id, { uploads: false, bing: true, bingMarket: 'en-US', wikimedia: false, wikimediaCategory: '', unsplash: false, unsplashQuery: '', rotate: 'tab', dim: 10, blur: 0 });
    await store.saveNow();
    const saved = backing.data.state as { version: number; dashboards: Array<{ id: string; background?: { bing: boolean } }>; widgets: unknown[] };
    expect(saved.version).toBe(3);
    expect(saved.dashboards.find((x) => x.id === d.id)?.background?.bing).toBe(true);
    store.setDashboardBackground(d.id, undefined);
    expect(store.dashboards.find((x) => x.id === d.id)?.background).toBeUndefined();
  });

  it('shows the same layout order on a narrow screen per dashboard', async () => {
    const store = await freshStore();
    const a = store.addWidget('clock')!;
    const b = store.addWidget('clock')!;
    store.addDashboard('Other');
    const c = store.addWidget('notes')!;
    store.reorder([c.id]); // Only the shown dashboard's widgets take part.
    expect(store.widgets.find((w) => w.id === a.id)!.y).toBe(0);
    expect(store.widgets.find((w) => w.id === b.id)!.y).toBe(a.h);
  });

  it('keeps feeds from every dashboard in the list the background worker refreshes', async () => {
    const { collectWantedFeeds } = await import('../utils/rss/service');
    const store = await freshStore();
    const first = store.addWidget('rss')!;
    store.updateConfig(first.id, { feeds: [{ url: 'https://a.test/f', title: 'A' }] });
    store.addDashboard('Other');
    const second = store.addWidget('rss')!;
    store.updateConfig(second.id, { feeds: [{ url: 'https://b.test/f', title: 'B' }] });
    expect(collectWantedFeeds(store.widgets).map((f) => f.url)).toEqual(['https://a.test/f', 'https://b.test/f']);
  });
});

describe('one-column heights', () => {
  it('changes only the height of widgets and ignores nonsense', async () => {
    const store = await freshStore();
    const a = store.addWidget('clock')!;
    const before = { x: a.x, y: a.y, w: a.w };
    store.setHeights([{ id: a.id, h: 7 }, { id: 'missing', h: 3 }]);
    expect(store.widgets[0]).toMatchObject({ ...before, h: 7 });
    store.setHeights([{ id: a.id, h: 0 }, { id: a.id, h: Number.NaN }]);
    expect(store.widgets[0]?.h).toBe(7);
  });
});
