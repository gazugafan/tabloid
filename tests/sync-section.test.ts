import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SyncSection from '../components/settings/SyncSection.vue';

describe('SyncSection', () => {
  it('lists every provider and shows the matching panel with a general notice', async () => {
    const wrapper = mount(SyncSection);
    await flushPromises();
    expect(wrapper.findAll('input[type=radio]')).toHaveLength(5);
    expect(wrapper.text()).not.toContain('each device');

    await wrapper.find('input[type=radio][value=github]').setValue(true);
    await flushPromises();
    expect(wrapper.text()).toContain('each device');
    expect(wrapper.find('input[placeholder="owner/name"]').exists()).toBe(true);

    await wrapper.find('input[type=radio][value=webdav]').setValue(true);
    await flushPromises();
    expect(wrapper.text()).toContain('Folder address');
  });
});
