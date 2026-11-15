import { readFileSync } from 'node:fs';
import { flushPromises, mount } from '@vue/test-utils';
import { browser } from 'wxt/browser';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RssWidget from '../components/widgets/rss/RssWidget.vue';
import { useLayoutStore } from '../stores/layout';
import { createFeedCache } from '../utils/rss/cache';
import { DEFAULT_RSS_CONFIG } from '../utils/rss/config';
import { refreshFeeds } from '../utils/rss/refresh';
import { READ_STATE_KEY } from '../utils/rss/readState';
import { createDefaultStore } from '../utils/storage/store';

const HN = 'https://news.ycombinator.com/rss';
const BBC = 'https://feeds.bbci.co.uk/news/rss.xml';
const fixture = (name: string) => readFileSync(`tests/fixtures/rss/${name}`);

/** Puts real fixtures into the cache the widget reads, as the background worker would. */
async function seedCache() {
  const fetchFn = vi.fn(async (url: string | URL | Request) => new Response(fixture(String(url) === HN ? 'hn.xml' : 'bbc.xml'))) as unknown as typeof fetch;
  await refreshFeeds([HN, BBC], { cache: createFeedCache(createDefaultStore()), fetchFn });
}

const feeds = [
  { url: HN, title: 'Hacker News', color: '#f76b15' },
  { url: BBC, title: 'BBC', color: '#e5484d' },
];
const mountWidget = (config: Record<string, unknown>) =>
  mount(RssWidget, { props: { config: { ...DEFAULT_RSS_CONFIG, ...config } }, global: { stubs: { FeedPicker: true } } });

describe('RssWidget', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    // Widgets from earlier tests are still mounted and may refresh: keep them off the real network.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(true as never);
    await seedCache();
  });

  it('offers to add feeds when it has none', async () => {
    const wrapper = mountWidget({ feeds: [] });
    await flushPromises();
    expect(wrapper.text()).toContain('Add feeds');
    expect(wrapper.find('article').exists()).toBe(false);
  });

  it('shows a heading only when the widget has a title', async () => {
    const plain = mountWidget({ feeds });
    await flushPromises();
    expect(plain.find('.heading').exists()).toBe(false);
    const titled = mountWidget({ feeds, title: 'Tech news' });
    await flushPromises();
    expect(titled.find('.heading').text()).toBe('Tech news');
  });

  it('renders cached items from every feed in one merged list, newest first', async () => {
    const wrapper = mountWidget({ feeds, maxItems: 50 });
    await vi.waitFor(() => expect(wrapper.findAll('article').length).toBeGreaterThan(5));
    const sources = new Set(wrapper.findAll('.source').map((s) => s.text()));
    expect(sources).toEqual(new Set(['Hacker News', 'BBC']));
    const times = wrapper.findAll('time').map((t) => Date.parse(t.attributes('datetime')!));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('starts with the configured number of items and reveals more on request', async () => {
    const wrapper = mountWidget({ feeds, maxItems: 3 });
    await vi.waitFor(() => expect(wrapper.findAll('article')).toHaveLength(3));
    await wrapper.find('.more button').trigger('click');
    expect(wrapper.findAll('article')).toHaveLength(6);
    // Keep going until everything cached is showing; then the button goes away.
    for (let i = 0; i < 40 && wrapper.find('.more button').exists(); i++) await wrapper.find('.more button').trigger('click');
    expect(wrapper.find('.more').exists()).toBe(false);
    expect(wrapper.findAll('article').length).toBeGreaterThan(6);
  });

  it('offers a Refresh action to the frame, disabled while there is nothing to refresh', async () => {
    const wrapper = mountWidget({ feeds });
    await vi.waitFor(() => expect(wrapper.emitted('update:actions')).toBeTruthy());
    const actions = wrapper.emitted('update:actions')!.at(-1)![0] as Array<{ id: string; icon: string; disabled?: boolean }>;
    expect(actions.map((a) => a.id)).toEqual(['refresh']);
    const empty = mountWidget({ feeds: [] });
    await vi.waitFor(() => expect(empty.emitted('update:actions')).toBeTruthy());
    expect((empty.emitted('update:actions')!.at(-1)![0] as Array<{ disabled?: boolean }>)[0]?.disabled).toBe(true);
  });

  it('shows one feed per tab in tabs mode', async () => {
    const wrapper = mountWidget({ feeds, mode: 'tabs', maxItems: 50 });
    await vi.waitFor(() => expect(wrapper.findAll('article').length).toBeGreaterThan(0));
    expect(wrapper.findAll('[role=tab]')).toHaveLength(2);
    expect(new Set(wrapper.findAll('.source').map((s) => s.text()))).toEqual(new Set(['Hacker News']));
    await wrapper.findAll('[role=tab]')[1]!.trigger('click');
    expect(new Set(wrapper.findAll('.source').map((s) => s.text()))).toEqual(new Set(['BBC']));
  });

  it('shows the site icon instead of a dot when asked, falling back to the dot without one', async () => {
    const cache = createFeedCache(createDefaultStore());
    await cache.put({ ...(await cache.get(HN))!, iconUrl: 'https://news.ycombinator.com/y18.svg', iconCheckedAt: 1 });
    const withIcon = mountWidget({ feeds: [feeds[0]!], feedMarker: 'icon', refreshOnOpen: false });
    await vi.waitFor(() => expect(withIcon.findAll('article').length).toBeGreaterThan(0), { timeout: 5000 });
    await vi.waitFor(() => expect(withIcon.find('.source img.icon').attributes('src')).toBe('https://news.ycombinator.com/y18.svg'), { timeout: 5000 });
    expect(withIcon.find('.source i.dot').exists()).toBe(false);
    const dots = mountWidget({ feeds: [feeds[0]!], feedMarker: 'dot', refreshOnOpen: false });
    await vi.waitFor(() => expect(dots.find('.source i.dot').exists()).toBe(true), { timeout: 5000 });
    // A feed no other test touches, so no background refresh can have found it an icon.
    const lonely = 'https://noicon.example/rss';
    const fetchFn = vi.fn(async () => new Response(fixture('bbc.xml'))) as unknown as typeof fetch;
    await refreshFeeds([lonely], { cache: createFeedCache(createDefaultStore()), fetchFn });
    const noIcon = mountWidget({ feeds: [{ url: lonely, title: 'Lonely', color: '#e5484d' }], feedMarker: 'icon', refreshOnOpen: false });
    await vi.waitFor(() => expect(noIcon.find('.source i.dot').exists()).toBe(true), { timeout: 5000 });
  }, 20_000);

  it('can show an All tab first, then one tab per feed', async () => {
    const wrapper = mountWidget({ feeds, mode: 'all-tabs', maxItems: 50 });
    await vi.waitFor(() => expect(wrapper.findAll('article').length).toBeGreaterThan(0));
    const tabs = wrapper.findAll('[role=tab]');
    expect(tabs.map((t) => t.text())).toEqual(['All', 'Hacker News', 'BBC']);
    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
    expect(new Set(wrapper.findAll('.source').map((s) => s.text()))).toEqual(new Set(['Hacker News', 'BBC']));
    await tabs[2]!.trigger('click');
    expect(new Set(wrapper.findAll('.source').map((s) => s.text()))).toEqual(new Set(['BBC']));
    await wrapper.findAll('[role=tab]')[0]!.trigger('click');
    expect(new Set(wrapper.findAll('.source').map((s) => s.text())).size).toBe(2);
  });

  it('opens links in a new tab by default, stays in the tab when told to, and never renders feed HTML', async () => {
    const defaults = mountWidget({ feeds });
    await vi.waitFor(() => expect(defaults.findAll('article').length).toBeGreaterThan(0));
    expect(defaults.find('a.title').attributes('target')).toBe('_blank');
    const same = mountWidget({ feeds, newTab: false });
    await vi.waitFor(() => expect(same.findAll('article').length).toBeGreaterThan(0));
    expect(same.find('a.title').attributes('target')).toBeUndefined();
    expect(same.find('a.title').attributes('rel')).toContain('noopener');
    expect(same.html()).not.toMatch(/<script/i);
    const tab = mountWidget({ feeds, newTab: true });
    await vi.waitFor(() => expect(tab.findAll('article').length).toBeGreaterThan(0));
    expect(tab.find('a.title').attributes('target')).toBe('_blank');
  });

  it('marks an item read when opened, dimming it', async () => {
    const wrapper = mountWidget({ feeds, maxItems: 5 });
    await vi.waitFor(() => expect(wrapper.findAll('article').length).toBeGreaterThan(0));
    expect(wrapper.find('article.read').exists()).toBe(false);
    await wrapper.find('a.title').trigger('click');
    const store = useLayoutStore();
    expect((store.preferences[READ_STATE_KEY] as { ids: string[] }).ids).toHaveLength(1);
    await vi.waitFor(() => expect(wrapper.findAll('article.read')).toHaveLength(1));
  });

  it('shows a problem note for a feed that failed without hiding its older items', async () => {
    const cache = createFeedCache(createDefaultStore());
    const cached = await cache.get(HN);
    await cache.put({ ...cached!, error: { message: 'news.ycombinator.com is down', at: Date.now() } });
    const wrapper = mountWidget({ feeds: [feeds[0]!] });
    await vi.waitFor(() => expect(wrapper.find('.problems').exists()).toBe(true));
    expect(wrapper.find('.problems').text()).toContain('news.ycombinator.com is down');
    expect(wrapper.findAll('article').length).toBeGreaterThan(0);
  });

  it('asks for permission when feeds are configured but access was never granted on this device', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false as never);
    const wrapper = mountWidget({ feeds });
    await vi.waitFor(() => expect(wrapper.text()).toContain('needs your permission'));
    expect(wrapper.findAll('article').length).toBeGreaterThan(0); // Cached articles still show.
  });
});
