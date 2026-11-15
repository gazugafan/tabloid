import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { LAYOUT_LOCKED_KEY, useLayoutLock } from '../composables/useLayoutLock';
import { memoryStore } from './helpers';

function setup(store = memoryStore()) {
  let locked!: ReturnType<typeof useLayoutLock>;
  mount(defineComponent({ setup: () => { locked = useLayoutLock(store); return {}; }, template: '<div />' }));
  return { store, locked };
}

describe('useLayoutLock', () => {
  it('starts unlocked', async () => {
    const { locked } = setup();
    await new Promise((r) => setTimeout(r, 10));
    expect(locked.value).toBe(false);
  });

  it('remembers the choice on this device', async () => {
    const first = setup();
    await new Promise((r) => setTimeout(r, 10));
    first.locked.value = true;
    await new Promise((r) => setTimeout(r, 10));
    expect(await first.store.get(LAYOUT_LOCKED_KEY)).toBe(true);
    const second = setup(first.store);
    await vi.waitFor(() => expect(second.locked.value).toBe(true));
  });

  it('does not overwrite a saved lock with the default while loading', async () => {
    const store = memoryStore();
    await store.set(LAYOUT_LOCKED_KEY, true);
    setup(store);
    await new Promise((r) => setTimeout(r, 10));
    expect(await store.get(LAYOUT_LOCKED_KEY)).toBe(true);
  });
});
