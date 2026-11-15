import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SearchWidget from '../components/widgets/search/SearchWidget.vue';
import { DEFAULT_SEARCH_CONFIG, sanitizeSearchConfig, searchUrl } from '../components/widgets/search/config';

describe('search config', () => {
  it('builds an encoded address for the chosen engine', () => {
    expect(searchUrl(DEFAULT_SEARCH_CONFIG, 'cats & dogs')).toBe('https://duckduckgo.com/?q=cats%20%26%20dogs');
    expect(searchUrl(DEFAULT_SEARCH_CONFIG, '   ')).toBeUndefined();
  });

  it('accepts only web addresses with %s for a custom engine', () => {
    const custom = (customUrl: string) => ({ ...DEFAULT_SEARCH_CONFIG, engine: 'custom' as const, customUrl });
    expect(searchUrl(custom('https://x.test/s?q=%s'), 'a b')).toBe('https://x.test/s?q=a%20b');
    expect(searchUrl(custom('https://x.test/s'), 'a')).toBeUndefined();
    expect(searchUrl(custom('javascript:alert(%s)'), 'a')).toBeUndefined();
  });

  it('falls back to defaults for unknown values', () => {
    expect(sanitizeSearchConfig({ engine: 'nope', newTab: 'yes' })).toEqual(DEFAULT_SEARCH_CONFIG);
  });
});

describe('SearchWidget', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the results in a new tab when asked', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const wrapper = mount(SearchWidget, { props: { config: { newTab: true } } });
    await wrapper.find('input').setValue('vue');
    await wrapper.find('form').trigger('submit');
    expect(open).toHaveBeenCalledWith('https://duckduckgo.com/?q=vue', '_blank', 'noopener,noreferrer');
  });

  it('does nothing for an empty search', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const wrapper = mount(SearchWidget, { props: { config: { newTab: true } } });
    await wrapper.find('form').trigger('submit');
    expect(open).not.toHaveBeenCalled();
  });
});
