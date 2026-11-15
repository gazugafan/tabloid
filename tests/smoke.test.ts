import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import App from '../entrypoints/newtab/App.vue';

describe('newtab App', () => {
  it('toggles the layout lock and lists registered widgets in the add menu', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } });
    await flushPromises();

    const lock = wrapper.find('button[aria-label$="layout"]');
    expect(lock.attributes('aria-pressed')).toBe('false');
    await lock.trigger('click');
    expect(lock.attributes('aria-pressed')).toBe('true');

    await wrapper.find('button[aria-label="Add widget"]').trigger('click');
    const items = wrapper.findAll('[role="menuitem"]').map((o) => o.text());
    expect(items).toEqual(expect.arrayContaining(['Clock', 'Notes']));
  });
});
