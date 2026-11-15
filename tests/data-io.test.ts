import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StoredState } from '../types/layout';
import { buildSetupExport, EXPORT_FORMAT, parseSetupImport, replaceWithImport } from '../utils/data/exportImport';
import { exportFeedGroups, importFeedsIntoState } from '../utils/data/stateEdits';
import { MAX_FEEDS_PER_WIDGET } from '../utils/rss/config';
import { buildOpml, MAX_OPML_FEEDS, parseOpml } from '../utils/rss/opml';

const widget = (id: string, type: string, config: Record<string, unknown> = {}, y = 0) => ({ id, dashboard: 'home', type, x: 0, y, w: 4, h: 4, config });
const state = (widgets: StoredState['widgets'], preferences: StoredState['preferences'] = {}): StoredState => ({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], widgets, preferences });

describe('setup export and import', () => {
  const current = state([widget('a', 'notes', { text: 'hello ✓' }), widget('b', 'rss', { feeds: [{ url: 'https://a.test/f', title: 'A' }] })], {
    appearance: { radius: 4 },
    background: { dim: 30 },
    rssRead: { ids: ['x'] },
  });

  it('round-trips widgets and settings but leaves out read history and anything device-bound', () => {
    const json = buildSetupExport(current, new Date('2026-11-06T12:00:00Z'));
    const file = JSON.parse(json);
    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.exportedAt).toBe('2026-11-06T12:00:00.000Z');
    expect(file.preferences).toEqual({ appearance: { radius: 4 }, background: { dim: 30 } });
    expect(json).not.toMatch(/token|password|accessToken|refreshToken/i);
    // An RSS widget's feeds and display options are part of its config, so they travel with the setup.
    expect(file.widgets[1].config.feeds).toEqual([{ url: 'https://a.test/f', title: 'A' }]);
    const imported = parseSetupImport(json);
    expect(imported.widgets).toEqual(current.widgets);
    expect(imported.preferences).toEqual({ appearance: { radius: 4 }, background: { dim: 30 } });
  });

  it('rejects files that are not Tabloid setups, with readable messages', () => {
    expect(() => parseSetupImport('not json')).toThrow(/valid JSON/);
    expect(() => parseSetupImport('{"widgets": []}')).toThrow(/doesn't look like a Tabloid/);
    expect(() => parseSetupImport(JSON.stringify({ format: EXPORT_FORMAT, version: 999, widgets: [] }))).toThrow(/newer/);
    expect(() => parseSetupImport('x'.repeat(11 * 1024 * 1024))).toThrow(/too large/);
  });

  it('upgrades older setups and drops malformed widgets', () => {
    const imported = parseSetupImport(JSON.stringify({ format: EXPORT_FORMAT, version: 1, widgets: [widget('a', 'clock'), { id: 'broken' }, 7] }));
    expect(imported.version).toBe(3);
    expect(imported.dashboards).toEqual([{ id: 'home', name: 'Home' }]);
    expect(imported.widgets.every((w) => w.dashboard === 'home')).toBe(true);
    expect(imported.widgets.map((w) => w.id)).toEqual(['a']);
    expect(imported.preferences).toEqual({});
  });

  it('keeps this device\'s read history when a setup replaces the current one', () => {
    const imported = state([widget('z', 'clock')], { appearance: { radius: 9 } });
    const result = replaceWithImport(current, imported);
    expect(result.widgets.map((w) => w.id)).toEqual(['z']);
    expect(result.preferences).toEqual({ appearance: { radius: 9 }, rssRead: { ids: ['x'] } });
  });
});

describe('OPML parsing', () => {
  const folders = parseOpml(readFileSync('tests/fixtures/opml/feedly.opml', 'utf-8'));

  it('keeps folders, nested folder names, and loose feeds (loose ones first)', () => {
    expect(folders.map((f) => f.name)).toEqual(['', 'Tech', 'Tech / Dev', 'Bad ones']);
    expect(folders[0]?.feeds.map((f) => f.url)).toEqual(['http://example.com/feed.xml']);
    expect(folders[1]?.feeds.map((f) => f.title)).toEqual(['Hacker News', 'Ars & Friends']);
    expect(folders[2]?.feeds[0]).toMatchObject({ title: 'GitHub Blog', url: 'https://github.blog/feed/' });
    expect(folders[1]?.feeds[0]?.siteUrl).toBe('https://news.ycombinator.com/');
  });

  it('drops unsafe addresses and duplicates, and names untitled feeds after their site', () => {
    expect(folders.flatMap((f) => f.feeds).some((f) => f.url.startsWith('javascript'))).toBe(false);
    const bad = folders.find((f) => f.name === 'Bad ones')!;
    expect(bad.feeds.map((f) => f.title)).toEqual(['noname.test']); // The duplicate of Hacker News is gone.
  });

  it('rejects files that are not OPML, empty lists, and absurdly large ones', () => {
    expect(() => parseOpml('<html></html>')).toThrow(/doesn't look like an OPML/);
    expect(() => parseOpml('<opml version="2.0"><body><outline text="Empty"/></body></opml>')).toThrow(/No feeds/);
    const many = Array.from({ length: MAX_OPML_FEEDS + 1 }, (_, i) => `<outline xmlUrl="https://f${i}.test/rss"/>`).join('');
    expect(() => parseOpml(`<opml version="2.0"><body>${many}</body></opml>`)).toThrow(/too many/);
  });
});

describe('OPML export', () => {
  it('writes escaped, well-formed OPML that reads back the same', () => {
    const xml = buildOpml([{ name: 'News & "Views"', feeds: [{ title: 'A <b> & B', url: 'https://a.test/rss?x=1&y=2' }] }], new Date('2026-11-06T12:00:00Z'));
    expect(xml).toContain('<dateCreated>Fri, 06 Nov 2026 12:00:00 GMT</dateCreated>');
    const back = parseOpml(xml);
    expect(back).toEqual([{ name: 'News & "Views"', feeds: [{ title: 'A <b> & B', url: 'https://a.test/rss?x=1&y=2', siteUrl: undefined }] }]);
  });

  it('puts feeds of an unnamed group at the top level and skips empty groups', () => {
    const xml = buildOpml([{ name: '', feeds: [{ title: 'A', url: 'https://a.test/rss' }] }, { name: 'Empty', feeds: [] }]);
    expect(xml).not.toContain('Empty');
    expect(parseOpml(xml)[0]?.name).toBe('');
  });

  it('makes one folder per RSS widget, in reading order, ignoring other widgets', () => {
    const feeds = (n: number) => ({ feeds: [{ url: `https://f${n}.test/rss`, title: `Feed ${n}` }] });
    const groups = exportFeedGroups(state([widget('r2', 'rss', feeds(2), 5), widget('n', 'notes'), widget('r1', 'rss', feeds(1), 0)]));
    expect(groups).toEqual([
      { name: 'RSS feeds 1', feeds: [{ title: 'Feed 1', url: 'https://f1.test/rss' }] },
      { name: 'RSS feeds 2', feeds: [{ title: 'Feed 2', url: 'https://f2.test/rss' }] },
    ]);
    expect(exportFeedGroups(state([widget('r', 'rss', feeds(1))]))[0]?.name).toBe('RSS feeds');
  });

  it('names a folder after the widget title when it has one', () => {
    const config = { title: 'Tech news', feeds: [{ url: 'https://f.test/rss', title: 'F' }] };
    expect(exportFeedGroups(state([widget('r', 'rss', config)]))[0]?.name).toBe('Tech news');
  });
});

describe('importing feeds into the layout', () => {
  const folders = parseOpml(readFileSync('tests/fixtures/opml/feedly.opml', 'utf-8'));
  let counter = 0;
  const deps = { size: { w: 4, h: 9 }, dashboard: 'home', newId: () => `new-${++counter}` };
  const base = state([widget('keep', 'notes', {}, 0)]);

  it('makes one widget per folder, stacked below what is there', () => {
    const result = importFeedsIntoState(base, folders, { kind: 'per-folder' }, deps);
    expect(result.widgetsAdded).toBe(4);
    expect(result.feedsAdded).toBe(5);
    const added = result.state.widgets.slice(1);
    expect(added.every((w) => w.type === 'rss' && w.w === 4 && w.h === 9)).toBe(true);
    expect(added[1]!.y).toBeGreaterThan(added[0]!.y);
    expect(added[0]!.y).toBeGreaterThanOrEqual(4);
    expect((added[1]!.config as { feeds: Array<{ title: string; color: string }> }).feeds.map((f) => f.title)).toEqual(['Hacker News', 'Ars & Friends']);
  });

  it('uses folder names as widget titles', () => {
    const result = importFeedsIntoState(base, folders, { kind: 'per-folder' }, deps);
    const titles = result.state.widgets.slice(1).map((w) => (w.config as { title: string }).title);
    expect(titles).toEqual(folders.filter((f) => f.feeds.length).map((f) => f.name));
  });

  it('can put everything into one widget, splitting when it would hold too many', () => {
    const one = importFeedsIntoState(base, folders, { kind: 'single' }, deps);
    expect(one.widgetsAdded).toBe(1);
    expect((one.state.widgets[1]!.config as { feeds: unknown[] }).feeds).toHaveLength(5);
    const big = [{ name: '', feeds: Array.from({ length: MAX_FEEDS_PER_WIDGET + 5 }, (_, i) => ({ title: `F${i}`, url: `https://f${i}.test/rss` })) }];
    const split = importFeedsIntoState(base, big, { kind: 'single' }, deps);
    expect(split.widgetsAdded).toBe(2);
    expect(split.feedsAdded).toBe(MAX_FEEDS_PER_WIDGET + 5);
  });

  it('adds to an existing RSS widget without duplicating feeds or exceeding its limit', () => {
    const existing = state([widget('rss1', 'rss', { feeds: [{ url: 'https://news.ycombinator.com/rss', title: 'HN', color: '#e5484d' }] })]);
    const result = importFeedsIntoState(existing, folders, { kind: 'existing', widgetId: 'rss1' }, deps);
    const feeds = (result.state.widgets[0]!.config as { feeds: Array<{ url: string }> }).feeds;
    expect(feeds.map((f) => f.url)).toContain('https://github.blog/feed/');
    expect(new Set(feeds.map((f) => f.url)).size).toBe(feeds.length);
    expect(result.feedsAdded).toBe(4);
    expect(result.feedsSkipped).toBe(1);
    expect(() => importFeedsIntoState(existing, folders, { kind: 'existing', widgetId: 'gone' }, deps)).toThrow(/isn't there/);
  });
});

describe('dashboards in exports and imports', () => {
  const feeds = (n: number) => ({ feeds: [{ url: `https://f${n}.test/rss`, title: `Feed ${n}` }] });
  const multi: StoredState = {
    version: 3,
    dashboards: [{ id: 'home', name: 'Home' }, { id: 'news', name: 'News' }, { id: 'empty', name: 'Empty' }],
    widgets: [
      { id: 'a', dashboard: 'news', type: 'rss', x: 0, y: 0, w: 4, h: 4, config: feeds(1) },
      { id: 'b', dashboard: 'home', type: 'rss', x: 0, y: 0, w: 4, h: 4, config: feeds(2) },
      { id: 'c', dashboard: 'home', type: 'rss', x: 0, y: 5, w: 4, h: 4, config: feeds(3) },
    ],
    preferences: {},
  };

  it('names OPML folders after their dashboard, numbering when a dashboard has several feed widgets', () => {
    expect(exportFeedGroups(multi).map((g) => g.name)).toEqual(['Home 1', 'Home 2', 'News']);
  });

  it('keeps the setup file\'s dashboards, their widgets and their own backgrounds', () => {
    const withBackground: StoredState = { ...multi, dashboards: [{ id: 'home', name: 'Home', background: { uploads: false, bing: true, bingMarket: 'en-US', wikimedia: false, wikimediaCategory: '', unsplash: false, unsplashQuery: '', rotate: 'day', dim: 5, blur: 2 } }, ...multi.dashboards.slice(1)] };
    const imported = parseSetupImport(buildSetupExport(withBackground));
    expect(imported.dashboards.map((d) => d.name)).toEqual(['Home', 'News', 'Empty']);
    expect(imported.dashboards[0]?.background?.bing).toBe(true);
    expect(imported.widgets.map((w) => w.dashboard)).toEqual(['news', 'home', 'home']);
  });

  it('places imported feed widgets on the chosen dashboard, below only that dashboard\'s widgets', () => {
    const folders = [{ name: '', feeds: [{ title: 'New', url: 'https://new.test/rss' }] }];
    const result = importFeedsIntoState(multi, folders, { kind: 'single' }, { size: { w: 4, h: 9 }, dashboard: 'news', newId: () => 'fresh' });
    const added = result.state.widgets.find((w) => w.id === 'fresh')!;
    expect(added.dashboard).toBe('news');
    expect(added.y).toBe(4); // Below the News widget (height 4), ignoring the Home widgets.
  });
});
