import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BookmarksWidget from '../components/widgets/bookmarks/BookmarksWidget.vue';
import BookmarksSettings from '../components/widgets/bookmarks/BookmarksSettings.vue';
import { MAX_LINKS, normalizeLinkUrl, sanitizeBookmarksConfig } from '../components/widgets/bookmarks/config';

describe('bookmark config', () => {
  it('adds https to bare addresses and rejects other schemes', () => {
    expect(normalizeLinkUrl('example.com')).toBe('https://example.com/');
    expect(normalizeLinkUrl(' http://a.test/x ')).toBe('http://a.test/x');
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeLinkUrl('')).toBeUndefined();
  });

  it('drops bad links, fills names, fixes duplicate ids and caps the count', () => {
    const config = sanitizeBookmarksConfig({
      links: [
        { id: 'a', title: '', url: 'https://www.example.com/' },
        { id: 'a', title: 'Dup', url: 'b.test' },
        { id: 'c', title: 'Bad', url: 'javascript:alert(1)' },
        'nope',
      ],
      layout: 'weird', display: 'preview',
    });
    expect(config.links.map((l) => l.title)).toEqual(['example.com', 'Dup']);
    expect(new Set(config.links.map((l) => l.id)).size).toBe(2);
    expect(config.layout).toBe('small');
    expect(config.display).toBe('preview');
    expect(sanitizeBookmarksConfig({ layout: 'grid' }).layout).toBe('small');
    const many = Array.from({ length: MAX_LINKS + 5 }, (_, i) => ({ url: `https://s${i}.test` }));
    expect(sanitizeBookmarksConfig({ links: many }).links).toHaveLength(MAX_LINKS);
  });
});

describe('BookmarksWidget', () => {
  it('shows links as anchors and a hint when empty', () => {
    const empty = mount(BookmarksWidget, { props: { config: {} } });
    expect(empty.text()).toContain('No links yet');
    const wrapper = mount(BookmarksWidget, { props: { config: { links: [{ id: '1', title: 'Example', url: 'https://example.com/' }], newTab: true, siteIcons: false } } });
    const a = wrapper.find('a');
    expect(a.attributes('href')).toBe('https://example.com/');
    expect(a.attributes('target')).toBe('_blank');
    expect(a.text()).toContain('Example');
    expect(wrapper.find('img').exists()).toBe(false);
  });
});

describe('BookmarksSettings', () => {
  it('adds a link from the form and rejects unusable addresses', async () => {
    const wrapper = mount(BookmarksSettings, { props: { config: {} } });
    await wrapper.find('input[aria-label="New link address"]').setValue('not a url with spaces%');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('update:config')).toBeUndefined();
    await wrapper.find('input[aria-label="New link address"]').setValue('news.test');
    await wrapper.find('input[aria-label="New link name"]').setValue('News');
    await wrapper.find('form').trigger('submit');
    const emitted = wrapper.emitted('update:config')![0]![0] as { links: Array<{ title: string; url: string }> };
    expect(emitted.links).toMatchObject([{ title: 'News', url: 'https://news.test/' }]);
  });
});

describe('BookmarksWidget previews', () => {
  const links = [{ id: '1', title: 'Example', url: 'https://example.com/' }];

  it('asks for permission before looking for preview images, and not for icons', async () => {
    vi.resetModules();
    vi.doMock('../utils/rss/permissions', () => ({ hasFeedAccess: async () => false, requestFeedAccess: async () => undefined }));
    const { default: Widget } = await import('../components/widgets/bookmarks/BookmarksWidget.vue');
    const preview = mount(Widget, { props: { config: { links, layout: 'large', display: 'preview' } } });
    await flushPromises();
    expect(preview.find('.notice').exists()).toBe(true);
    expect(preview.find('.shot').exists()).toBe(false);
    const icons = mount(Widget, { props: { config: { links, layout: 'large', display: 'icon' } } });
    await flushPromises();
    expect(icons.find('.notice').exists()).toBe(false);
    const list = mount(Widget, { props: { config: { links, layout: 'list', display: 'preview' } } });
    await flushPromises();
    expect(list.find('.notice').exists()).toBe(false);
    vi.doUnmock('../utils/rss/permissions');
  });
});
