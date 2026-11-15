import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardTabs from '../components/ui/DashboardTabs.vue';
import { useLayoutStore } from '../stores/layout';
import { createSingleKeyRepository } from '../utils/storage/repository';
import { memoryStore } from './helpers';

const undoable = vi.hoisted(() => vi.fn());
vi.mock('../composables/useNotify', async (original) => ({ ...(await original<typeof import('../composables/useNotify')>()), notifyUndoable: undoable }));

async function setup(locked = false) {
  setActivePinia(createPinia());
  const store = useLayoutStore();
  await store.init(createSingleKeyRepository(memoryStore()));
  store.dashboards[0]!.name = 'Home';
  const wrapper = mount(DashboardTabs, { props: { locked }, attachTo: document.body });
  return { store, wrapper };
}

const tabs = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[role=tab]');

describe('DashboardTabs', () => {
  beforeEach(() => {
    undoable.mockClear();
    document.body.innerHTML = '';
  });

  it('shows every dashboard as a tab with the active one selected, and switches on click', async () => {
    const { store, wrapper } = await setup();
    store.addDashboard('News');
    store.setActive(store.dashboards[0]!.id);
    await flushPromises();
    expect(tabs(wrapper).map((t) => t.text())).toEqual(['Home', 'News']);
    expect(tabs(wrapper).map((t) => t.attributes('aria-selected'))).toEqual(['true', 'false']);
    await tabs(wrapper)[1]!.trigger('click');
    expect(store.activeDashboard?.name).toBe('News');
    expect(tabs(wrapper)[1]!.attributes('aria-selected')).toBe('true');
  });

  it('adds a dashboard, switches to it and lets you name it straight away', async () => {
    const { store, wrapper } = await setup();
    await wrapper.find('button.add').trigger('click');
    await flushPromises();
    expect(store.dashboards).toHaveLength(2);
    const input = wrapper.find('input.rename');
    expect(input.exists()).toBe(true);
    await input.setValue('Weekend plans');
    await input.trigger('keydown.enter');
    expect(store.activeDashboard?.name).toBe('Weekend plans');
    expect(wrapper.find('input.rename').exists()).toBe(false);
  });

  it('renames on double-click, cancels with Escape, and ignores an empty name', async () => {
    const { store, wrapper } = await setup();
    await tabs(wrapper)[0]!.trigger('dblclick');
    await wrapper.find('input.rename').setValue('Changed');
    await wrapper.find('input.rename').trigger('keydown.esc');
    expect(store.dashboards[0]?.name).toBe('Home');
    await tabs(wrapper)[0]!.trigger('dblclick');
    await wrapper.find('input.rename').setValue('   ');
    await wrapper.find('input.rename').trigger('keydown.enter');
    expect(store.dashboards[0]?.name).toBe('Home');
  });

  it('moves between tabs with the arrow keys', async () => {
    const { store, wrapper } = await setup();
    store.addDashboard('News');
    store.setActive(store.dashboards[0]!.id);
    await flushPromises();
    await wrapper.find('nav').trigger('keydown', { key: 'ArrowRight' });
    expect(store.activeDashboard?.name).toBe('News');
    await wrapper.find('nav').trigger('keydown', { key: 'ArrowRight' });
    expect(store.activeDashboard?.name).toBe('Home'); // Wraps around.
  });

  it('deletes from the menu with an Undo, and the last dashboard cannot be deleted', async () => {
    const { store, wrapper } = await setup();
    store.addWidget('clock');
    const second = store.addDashboard('News')!;
    store.addWidget('notes');
    await flushPromises();
    await wrapper.find('.menu-button').trigger('click');
    const items = [...document.querySelectorAll('.tab-menu button')] as HTMLButtonElement[];
    expect(items.map((b) => b.textContent)).toEqual(['Rename', 'Move left', 'Move right', 'Delete dashboard']);
    expect(items[2]!.disabled).toBe(true); // Already last.
    items[3]!.click();
    await flushPromises();
    expect(store.dashboards.map((d) => d.name)).toEqual(['Home']);
    expect(undoable).toHaveBeenCalledTimes(1);
    expect(undoable.mock.calls[0]![0]).toContain('News');
    expect(undoable.mock.calls[0]![0]).toContain('1 widget');
    undoable.mock.calls[0]![1]();
    expect(store.dashboards.map((d) => d.id)).toEqual([store.dashboards[0]!.id, second.id]);
    expect(store.widgets.filter((w) => w.dashboard === second.id)).toHaveLength(1);
  });

  it('can reorder from the menu', async () => {
    const { store, wrapper } = await setup();
    store.addDashboard('News');
    await flushPromises();
    await wrapper.find('.menu-button').trigger('click');
    ([...document.querySelectorAll('.tab-menu button')] as HTMLButtonElement[])[1]!.click(); // Move left
    await flushPromises();
    expect(store.dashboards.map((d) => d.name)).toEqual(['News', 'Home']);
  });

  it('only lets you switch and add while the layout is locked', async () => {
    const { store, wrapper } = await setup(true);
    expect(wrapper.find('.menu-button').exists()).toBe(false);
    await tabs(wrapper)[0]!.trigger('dblclick');
    expect(wrapper.find('input.rename').exists()).toBe(false);
    expect(tabs(wrapper)[0]!.attributes('draggable')).toBe('false');
    await wrapper.find('button.add').trigger('click');
    expect(store.dashboards).toHaveLength(2);
  });
});
