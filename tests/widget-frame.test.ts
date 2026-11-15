import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import WidgetFrame from '../components/ui/WidgetFrame.vue';

// Settings dialogs are teleported to the body; clear any a test left open.
afterEach(() => document.body.querySelectorAll('.settings-dialog').forEach((el) => el.remove()));

const widget = { id: 'a', dashboard: 'home', type: 'loading-test', x: 0, y: 0, w: 3, h: 3, config: {} };

describe('WidgetFrame loading state', () => {
  it('shows the loading ring and aria-busy while the widget reports loading', async () => {
    const wrapper = mount(WidgetFrame, { props: { widget, locked: false } });
    await vi.waitFor(() => expect(wrapper.find('.loading-test button').exists()).toBe(true));
    expect(wrapper.find('.loading-ring').exists()).toBe(false);
    expect(wrapper.attributes('aria-busy')).toBe('false');

    await wrapper.find('.loading-test button').trigger('click');
    expect(wrapper.find('.loading-ring').exists()).toBe(true);
    expect(wrapper.attributes('aria-busy')).toBe('true');

    await wrapper.find('.loading-test button').trigger('click');
    await flushPromises();
    expect(wrapper.attributes('aria-busy')).toBe('false');
  });

  it('draws no controls box for a locked widget without settings', async () => {
    const wrapper = mount(WidgetFrame, { props: { widget, locked: true } });
    expect(wrapper.find('.controls').exists()).toBe(false);
    const unlocked = mount(WidgetFrame, { props: { widget, locked: false } });
    expect(unlocked.find('.controls').exists()).toBe(true);
  });

  it('shows widget-provided action buttons even when locked', async () => {
    setActivePinia(createPinia());
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(true as never);
    const wrapper = mount(WidgetFrame, { props: { widget: { ...widget, type: 'rss', config: {} }, locked: true } });
    await vi.waitFor(() => expect(wrapper.find('button[aria-label="Refresh feeds"]').exists()).toBe(true));
    expect(wrapper.find('.controls').exists()).toBe(true);
    expect(wrapper.find('.drag-handle').exists()).toBe(false); // Locked: no moving.
    expect(wrapper.find('button[aria-label^="Remove"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Refresh feeds"]').attributes('disabled')).toBeDefined(); // No feeds yet.
  });

  describe('transparent widgets', () => {
    const notes = { id: 'n', dashboard: 'home', type: 'notes', x: 0, y: 0, w: 4, h: 4, config: {} };

    it('offers the look option in every widget\'s settings, but locks away the button unless the widget has its own settings', async () => {
      const unlocked = mount(WidgetFrame, { props: { widget: notes, locked: false } });
      expect(unlocked.find('button[title="Widget settings"]').exists()).toBe(true); // Notes has no settings of its own.
      const locked = mount(WidgetFrame, { props: { widget: notes, locked: true } });
      expect(locked.find('button[title="Widget settings"]').exists()).toBe(false);
      const clock = mount(WidgetFrame, { props: { widget: { ...notes, type: 'clock' }, locked: true } });
      expect(clock.find('button[aria-label="Clock settings"]').exists()).toBe(true); // Named after the widget for screen readers.
    });

    it('turns the card off and on from the settings panel', async () => {
      const wrapper = mount(WidgetFrame, { props: { widget: notes, locked: false } });
      expect(wrapper.find('.frame, section').classes()).not.toContain('transparent');
      await wrapper.find('button[title="Widget settings"]').trigger('click');
      const box = document.body.querySelector<HTMLInputElement>('.settings-dialog .general input');
      expect(box).not.toBeNull();
      box!.checked = true;
      box!.dispatchEvent(new Event('change'));
      expect(wrapper.emitted('update:transparent')![0]).toEqual([true]);
      await wrapper.setProps({ widget: { ...notes, transparent: true } });
      expect(wrapper.find('section').classes()).toContain('transparent');
    });
  });

  it('shows the settings in a modal dialog, look option first, that closes again', async () => {
    setActivePinia(createPinia());
    const wrapper = mount(WidgetFrame, { props: { widget: { id: 'c', dashboard: 'home', type: 'clock', x: 0, y: 0, w: 3, h: 3, config: {} }, locked: false } });
    expect(document.body.querySelector('.settings-dialog')).toBeNull();
    await wrapper.find('button[title="Widget settings"]').trigger('click');
    const content = document.body.querySelector('.settings-dialog .content')!;
    expect(document.body.querySelector('.settings-dialog h2')!.textContent).toBe('Clock settings');
    await vi.waitFor(() => expect(content.children.length).toBeGreaterThan(1));
    expect(content.children[0]?.className).toContain('general');
    expect(content.children[1]?.className).not.toContain('general'); // The widget's own settings come after.
    document.body.querySelector<HTMLButtonElement>('.settings-dialog .close')!.click();
    await flushPromises();
    expect(document.body.querySelector('.settings-dialog')).toBeNull();
  });
});
