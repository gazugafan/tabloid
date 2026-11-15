import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { GridLayout } from 'grid-layout-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardGrid from '../components/ui/DashboardGrid.vue';
import { useLayoutStore } from '../stores/layout';
import { createSingleKeyRepository } from '../utils/storage/repository';
import { memoryStore } from './helpers';

function matchMedia(narrow: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width') ? narrow : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function mountGrid(narrow: boolean, locked = false) {
  matchMedia(narrow);
  setActivePinia(createPinia());
  const store = useLayoutStore();
  await store.init(createSingleKeyRepository(memoryStore()));
  store.addWidget('clock');
  return mount(DashboardGrid, { props: { locked } });
}

afterEach(() => vi.unstubAllGlobals());

describe('DashboardGrid resizing', () => {
  it('lets widgets be resized on a wide screen, but not while the layout is locked', async () => {
    expect((await mountGrid(false)).findComponent(GridLayout).props('isResizable')).toBe(true);
    expect((await mountGrid(false, true)).findComponent(GridLayout).props('isResizable')).toBe(false);
  });

  it('also lets widgets be resized on a narrow screen (the one-column layout), where only height can change', async () => {
    const wrapper = await mountGrid(true);
    expect(wrapper.findComponent(GridLayout).props('colNum')).toBe(1);
    expect(wrapper.findComponent(GridLayout).props('isResizable')).toBe(true);
    expect((await mountGrid(true, true)).findComponent(GridLayout).props('isResizable')).toBe(false);
  });
});
