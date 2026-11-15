import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingWizard from '../components/onboarding/OnboardingWizard.vue';
import { getWidgetDefinition } from '../components/widgets/registry';
import { useLayoutStore } from '../stores/layout';
import { DEFAULT_CHOICES, FEEDS_PER_TOPIC, QUICK_SITES, TOPICS, topicFeeds } from '../utils/onboarding/choices';
import { buildPlan } from '../utils/onboarding/plan';
import { createOnboardingState, shouldWelcome } from '../utils/onboarding/state';
import { packWidgets } from '../utils/layout';
import { POPULAR_CATEGORIES } from '../utils/rss/popular';
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

describe('packWidgets', () => {
  it('fills rows left to right and starts a new row when full', () => {
    expect(packWidgets([{ w: 6, h: 2 }, { w: 3, h: 2 }, { w: 3, h: 5 }, { w: 4, h: 4 }], 10)).toEqual([
      { x: 0, y: 10 },
      { x: 6, y: 10 },
      { x: 9, y: 10 },
      { x: 0, y: 15 },
    ]);
  });
});

describe('onboarding state', () => {
  it('is remembered, and only welcomes empty, unseen dashboards', async () => {
    const state = createOnboardingState(memoryStore());
    expect(await state.isDone()).toBe(false);
    await state.markDone();
    expect(await state.isDone()).toBe(true);
    expect(shouldWelcome(false, 0)).toBe(true);
    expect(shouldWelcome(true, 0)).toBe(false);
    expect(shouldWelcome(false, 3)).toBe(false);
  });
});

describe('topics and sites', () => {
  it('every topic has real feeds in the directory', () => {
    for (const topic of TOPICS) {
      expect(POPULAR_CATEGORIES.some((c) => c.name === topic.id), topic.id).toBe(true);
      const feeds = topicFeeds(topic.id);
      expect(feeds.length).toBeGreaterThan(0);
      expect(feeds.length).toBeLessThanOrEqual(FEEDS_PER_TOPIC);
    }
  });
  it('quick sites are https addresses', () => {
    expect(QUICK_SITES.every((s) => s.url.startsWith('https://'))).toBe(true);
  });
});

describe('buildPlan', () => {
  it('turns choices into look and widgets, with a titled news widget per topic', () => {
    const plan = buildPlan({ ...DEFAULT_CHOICES, mode: 'dark', accent: '#ec4899', background: 'wikimedia', widgets: ['clock', 'weather', 'bookmarks'], place: { name: 'Paris', detail: 'France', latitude: 48.85, longitude: 2.35 }, topics: ['Technology', 'Sports'], sites: ['youtube', 'github'] });
    expect(plan.appearance).toMatchObject({ mode: 'dark', accent: '#ec4899' });
    expect(plan.background).toMatchObject({ bing: false, wikimedia: true });
    expect(plan.widgets.map((w) => w.type)).toEqual(['clock', 'weather', 'bookmarks', 'rss', 'rss']);
    expect((plan.widgets[1]!.config as { place: { name: string } }).place.name).toBe('Paris');
    expect((plan.widgets[2]!.config as { links: Array<{ title: string }> }).links.map((l) => l.title)).toEqual(['YouTube', 'GitHub']);
    const news = plan.widgets.filter((w) => w.type === 'rss').map((w) => w.config as { title: string; feeds: unknown[] });
    expect(news.map((n) => n.title)).toEqual(['Technology', 'Sports']);
    expect(news.every((n) => n.feeds.length > 0)).toBe(true);
  });

  it('every planned widget type exists in the registry', () => {
    const plan = buildPlan({ ...DEFAULT_CHOICES, widgets: ['search', 'clock', 'weather', 'bookmarks', 'todo', 'notes'], topics: ['News'] });
    expect(plan.widgets.every((w) => getWidgetDefinition(w.type))).toBe(true);
  });

  it('plain background turns pictures off', () => {
    const plan = buildPlan({ ...DEFAULT_CHOICES, background: 'plain' });
    expect(plan.background).toMatchObject({ bing: false, wikimedia: false, uploads: false });
  });
});

describe('OnboardingWizard', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const click = async (wrapper: ReturnType<typeof mount>, text: string) => {
    const button = wrapper.findAll('button').find((b) => b.text().includes(text));
    expect(button, `button "${text}"`).toBeTruthy();
    await button!.trigger('click');
  };

  it('walks through the steps and builds the chosen widgets on the dashboard', async () => {
    const store = useLayoutStore();
    const wrapper = mount(OnboardingWizard, { attachTo: document.body });
    expect(wrapper.find('[role=dialog]').exists()).toBe(true);
    expect(wrapper.find('h2').text()).toContain('Welcome');
    await click(wrapper, 'Let');
    expect(wrapper.find('h2').text()).toContain('starting from');
    await click(wrapper, 'Start fresh');
    expect(wrapper.text()).toContain('Step 1 of 4');
    await click(wrapper, 'Next'); // look
    await click(wrapper, 'Next'); // news (nothing chosen: no permission is asked)
    await click(wrapper, 'Next'); // widgets: defaults are search, clock and quick links
    expect(wrapper.find('h2').text()).toContain('Ready');
    await click(wrapper, 'Create my page');
    expect(store.widgets.map((w) => w.type)).toEqual(['search', 'clock', 'bookmarks']);
    expect(wrapper.find('h2').text()).toContain('ready');
    await click(wrapper, 'Show me around');
    expect(wrapper.emitted('close')![0]).toEqual([true]);
    wrapper.unmount();
  });

  it('asks for permission to read websites when a topic is chosen, from the Next click', async () => {
    vi.resetModules();
    const request = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../utils/rss/permissions', () => ({ requestFeedAccess: request, hasFeedAccess: async () => true }));
    const { default: Wizard } = await import('../components/onboarding/OnboardingWizard.vue');
    const wrapper = mount(Wizard, { attachTo: document.body });
    await click(wrapper, 'Let');
    await click(wrapper, 'Start fresh');
    await click(wrapper, 'Next'); // look -> news
    await wrapper.find('input[type=checkbox]').setValue(true); // first topic
    await click(wrapper, 'Next');
    expect(request).toHaveBeenCalledTimes(1);
    await flushPromises();
    wrapper.unmount();
    vi.doUnmock('../utils/rss/permissions');
  });

  it('can be skipped from the first screen', async () => {
    const wrapper = mount(OnboardingWizard);
    await click(wrapper, 'Skip for now');
    expect(wrapper.emitted('close')![0]).toEqual([false]);
  });
});

describe('starter layout', () => {
  const all = ['search', 'clock', 'weather', 'bookmarks', 'todo', 'notes'] as const;
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('fills every row of the grid, with nothing overlapping or sticking out', () => {
    for (const widgets of [[...all], ['search'], ['clock', 'weather'], ['weather', 'bookmarks', 'todo'], ['todo']]) {
      for (const topics of [[], ['News'], ['News', 'Sports'], ['News', 'Sports', 'Technology', 'Science']]) {
        const plan = buildPlan({ ...DEFAULT_CHOICES, widgets: [...widgets] as never, topics });
        for (const w of plan.widgets) expect(w.x + w.w).toBeLessThanOrEqual(12);
        for (const [i, a] of plan.widgets.entries()) for (const b of plan.widgets.slice(i + 1)) expect(overlap(a, b)).toBe(false);
      }
    }
  });

  it('puts search and clock across the top, then helpers and news in even rows', () => {
    const plan = buildPlan({ ...DEFAULT_CHOICES, widgets: [...all], topics: ['News', 'Sports'] });
    const by = (type: string) => plan.widgets.filter((w) => w.type === type);
    expect(by('search')[0]).toMatchObject({ x: 0, y: 0, w: 8, h: 2 });
    expect(by('clock')[0]).toMatchObject({ x: 8, y: 0, w: 4, h: 2 });
    expect(by('weather')[0]).toMatchObject({ y: 2, h: 5 });
    expect(by('todo')[0]).toMatchObject({ y: 7, h: 5 });
    expect(by('rss').map((w) => [w.x, w.y, w.w])).toEqual([[0, 12, 6], [6, 12, 6]]);
  });

  it('makes the search widget transparent, and only that one', () => {
    const plan = buildPlan({ ...DEFAULT_CHOICES, widgets: [...all] });
    expect(plan.widgets.filter((w) => w.transparent).map((w) => w.type)).toEqual(['search']);
  });
});
