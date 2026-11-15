import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import BackgroundSection from '../components/settings/BackgroundSection.vue';
import { DEFAULT_BACKGROUND } from '../utils/background/settings';
import { loadState, saveDashboardBackground, updateState } from '../utils/sync/preferences';
import { createConfiguredRepository } from '../utils/sync/manager';
import { migrateState } from '../utils/storage/migrations';

async function seed() {
  const repo = await createConfiguredRepository();
  await repo.save({
    version: 3,
    dashboards: [{ id: 'home', name: 'Home' }, { id: 'news', name: 'News' }],
    widgets: [],
    preferences: { background: { ...DEFAULT_BACKGROUND, dim: 33 } },
  });
  return repo;
}

describe('dashboard background settings (stored)', () => {
  it('sets and clears one dashboard\'s own settings without touching the others', async () => {
    const repo = await seed();
    await saveDashboardBackground('news', { ...DEFAULT_BACKGROUND, bing: true });
    let state = migrateState(await repo.load());
    expect(state.dashboards.find((d) => d.id === 'news')?.background?.bing).toBe(true);
    expect(state.dashboards.find((d) => d.id === 'home')?.background).toBeUndefined();
    expect(state.preferences.background).toMatchObject({ dim: 33 });
    await saveDashboardBackground('news', undefined);
    state = migrateState(await repo.load());
    expect(state.dashboards.find((d) => d.id === 'news')?.background).toBeUndefined();
  });

  it('loadState and updateState work on an empty store', async () => {
    const state = await loadState();
    expect(state.dashboards.length).toBeGreaterThan(0);
    await updateState((s) => ({ ...s, preferences: { x: 1 } }));
    expect((await loadState()).preferences).toEqual({ x: 1 });
  });
});

describe('BackgroundSection scope', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await seed();
  });

  it('edits the general settings by default, and a dashboard only once it has its own', async () => {
    const wrapper = mount(BackgroundSection, { attachTo: document.body });
    await flushPromises();
    const select = wrapper.find('select[aria-label^="Which dashboard"]');
    expect(select.findAll('option').map((o) => o.text())).toEqual(['All dashboards (default)', 'Home', 'News']);
    expect((wrapper.findAll('input[type=range]').at(-1)!.element as HTMLInputElement).value).toBe('33'); // "Darken image"

    await select.setValue('news');
    await flushPromises();
    expect(wrapper.find('.scoped').attributes('inert')).toBeDefined(); // Follows the default: read-only.
    expect(wrapper.text()).toContain('follows the default settings');

    await wrapper.find('input[type=checkbox]').setValue(true); // "Use different background settings"
    await flushPromises();
    expect(wrapper.find('.scoped').attributes('inert')).toBeUndefined();
    expect((await loadState()).dashboards.find((d) => d.id === 'news')?.background).toMatchObject({ dim: 33 }); // Starts from the general ones.
    expect(wrapper.text()).toContain('News (custom)');

    await wrapper.find('input[type=checkbox]').setValue(false);
    await flushPromises();
    expect((await loadState()).dashboards.find((d) => d.id === 'news')?.background).toBeUndefined();
  });
});

describe('previewBackground', () => {
  it('shows the current image without rotating or saving anything, and nothing when there is none', async () => {
    const { previewBackground } = await import('../utils/background/service');
    const { createDefaultStore } = await import('../utils/storage/store');
    const local = createDefaultStore();
    const blob = new Blob(['x']);
    const images = { list: async () => [{ id: 'a', name: 'a.jpg', blob }, { id: 'b', name: 'b.jpg', blob }] } as never;
    const deps = { images, local };
    await local.set('background:state:home', { id: 'upload:b', changedAt: 1 });
    expect((await previewBackground({ ...DEFAULT_BACKGROUND, rotate: 'tab' }, deps, 'home'))?.candidate.id).toBe('upload:b');
    expect(await local.get('background:state:home')).toEqual({ id: 'upload:b', changedAt: 1 });
    expect((await previewBackground(DEFAULT_BACKGROUND, deps, 'other'))?.candidate.id).toBe('upload:a');
    expect(await previewBackground({ ...DEFAULT_BACKGROUND, uploads: false }, deps)).toBeUndefined();
  });
});
