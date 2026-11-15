import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import WebpagesWidget from '../components/widgets/webpages/WebpagesWidget.vue';
import { pageAddress, sanitizeWebpagesConfig } from '../components/widgets/webpages/config';

const page = (url: string, title = '') => ({ id: url, url, title });

describe('pageAddress', () => {
  it('accepts web addresses, adding https when the scheme is missing', () => {
    expect(pageAddress('example.com')).toBe('https://example.com/');
    expect(pageAddress(' http://example.com/a?b=1 ')).toBe('http://example.com/a?b=1');
    expect(pageAddress('localhost:3000')).toBe('https://localhost:3000/');
  });
  it('rejects anything else', () => {
    for (const bad of ['', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'chrome://settings', 'nodots']) expect(pageAddress(bad)).toBeUndefined();
  });
});

describe('sanitizeWebpagesConfig', () => {
  it('tolerates junk and limits the number of pages', () => {
    expect(sanitizeWebpagesConfig(null)).toEqual({ pages: [], bypass: false });
    expect(sanitizeWebpagesConfig({ pages: [1, null, { url: 5 }] }).pages).toHaveLength(1);
    expect(sanitizeWebpagesConfig({ pages: Array.from({ length: 30 }, (_, i) => page(`a${i}.com`)) }).pages).toHaveLength(10);
  });
});

describe('WebpagesWidget', () => {
  const mountWith = (pages: unknown[]) => mount(WebpagesWidget, { props: { config: { pages } } });

  it('explains itself when there are no pages', () => {
    expect(mountWith([]).text()).toContain('Add a web page');
  });

  it('shows one page without a tab bar', async () => {
    const wrapper = mountWith([page('example.com')]);
    await flushPromises();
    expect(wrapper.find('[role=tablist]').exists()).toBe(false);
    expect(wrapper.find('iframe').attributes('src')).toBe('https://example.com/');
  });

  it('ignores addresses it cannot show', async () => {
    const wrapper = mountWith([page('javascript:alert(1)'), page('example.com')]);
    await flushPromises();
    expect(wrapper.findAll('iframe')).toHaveLength(1);
    expect(wrapper.find('[role=tablist]').exists()).toBe(false);
  });

  it('shows tabs for several pages and loads each page only once it is opened', async () => {
    const wrapper = mountWith([page('one.com', 'One'), page('two.com')]);
    await flushPromises();
    const tabs = wrapper.findAll('[role=tab]');
    expect(tabs.map((t) => t.text())).toEqual(['One', 'two.com']);
    expect(wrapper.findAll('iframe')).toHaveLength(1);
    await tabs[1]!.trigger('click');
    expect(wrapper.findAll('iframe')).toHaveLength(2);
    expect(wrapper.findAll('iframe').map((f) => (f.element as HTMLElement).style.display !== 'none')).toEqual([false, true]);
  });

  it('offers a reload action', async () => {
    const wrapper = mountWith([page('one.com')]);
    await flushPromises();
    const actions = wrapper.emitted('update:actions')!.at(-1)![0] as Array<{ id: string; run: () => void }>;
    expect(actions.map((a) => a.id)).toEqual(['reload']);
  });
});

describe('frame rules', () => {
  const widget = (config: unknown, type = 'webpages') => ({ type, config }) as never;

  it('are wanted only when a Webpages widget asks for them', async () => {
    const { wantsFrameRules } = await import('../components/widgets/webpages/frameRules');
    expect(wantsFrameRules([widget({ bypass: false, pages: [page('a.com')] }), widget({ bypass: true }, 'notes')])).toBe(false);
    expect(wantsFrameRules([widget({ bypass: true, pages: [page('a.com')] })])).toBe(true);
  });

  it('builds one rule per tab that touches every frame in that tab, and nothing else', async () => {
    const { buildTabFrameRule } = await import('../utils/frames/rules');
    const rule = buildTabFrameRule(42);
    expect(rule.id).toBe(42);
    expect(rule.condition).toEqual({ tabIds: [42], resourceTypes: ['sub_frame'] });
    expect(rule.action.responseHeaders.map((h) => h.header)).toEqual(['x-frame-options', 'content-security-policy']);
  });

  function fakeApis(sessionRules: unknown[] = [], dynamicRules: unknown[] = []) {
    return import('wxt/browser').then(({ browser }) => {
      const dnr = browser.declarativeNetRequest as unknown as Record<string, unknown>;
      const updateSession = vi.fn().mockResolvedValue(undefined);
      const updateDynamic = vi.fn().mockResolvedValue(undefined);
      dnr.getSessionRules = vi.fn().mockResolvedValue(sessionRules);
      dnr.updateSessionRules = updateSession;
      dnr.getDynamicRules = vi.fn().mockResolvedValue(dynamicRules);
      dnr.updateDynamicRules = updateDynamic;
      const scripting = browser.scripting as unknown as Record<string, unknown>;
      const register = vi.fn().mockResolvedValue(undefined);
      const unregister = vi.fn().mockResolvedValue(undefined);
      let registered: unknown[] = [];
      scripting.getRegisteredContentScripts = vi.fn(async () => registered);
      scripting.registerContentScripts = register.mockImplementation(async (scripts: unknown[]) => void (registered = scripts));
      scripting.unregisterContentScripts = unregister.mockImplementation(async () => void (registered = []));
      vi.spyOn(browser.tabs, 'getCurrent').mockResolvedValue({ id: 5 } as never);
      const contains = vi.spyOn(browser.permissions, 'contains').mockResolvedValue(true as never);
      return { updateSession, updateDynamic, register, unregister, contains };
    });
  }

  it('adds the rule for this tab and the frame script when wanted and permitted, and removes both otherwise', async () => {
    const { applyFrameRules } = await import('../components/widgets/webpages/frameRules');
    const apis = await fakeApis([], [{ id: 1 }]);
    await applyFrameRules(true);
    expect(apis.updateDynamic).toHaveBeenCalledWith({ removeRuleIds: [1] }); // Rules from earlier versions go.
    expect(apis.updateSession).toHaveBeenLastCalledWith({ removeRuleIds: [], addRules: [expect.objectContaining({ id: 5 })] });
    expect(apis.register).toHaveBeenCalledWith([expect.objectContaining({ id: 'tabloid-frame-bridge', allFrames: true })]);

    const { buildTabFrameRule } = await import('../utils/frames/rules');
    const off = await fakeApis([buildTabFrameRule(5)]);
    await applyFrameRules(true); // Rule already right: only the script gets registered.
    expect(off.updateSession).not.toHaveBeenCalled();
    off.contains.mockResolvedValue(false as never);
    await applyFrameRules(true);
    expect(off.updateSession).toHaveBeenLastCalledWith({ removeRuleIds: [5], addRules: [] });
    expect(off.unregister).toHaveBeenCalled();
  });

  it('leaves the rule alone when the browser returns it with its keys in another order', async () => {
    const { applyFrameRules } = await import('../components/widgets/webpages/frameRules');
    const { buildTabFrameRule } = await import('../utils/frames/rules');
    const rule = buildTabFrameRule(5);
    const reordered = { condition: { resourceTypes: rule.condition.resourceTypes, tabIds: rule.condition.tabIds }, action: { responseHeaders: rule.action.responseHeaders, type: rule.action.type }, priority: 1, id: 5 };
    const apis = await fakeApis([reordered]);
    await applyFrameRules(true);
    expect(apis.updateSession).not.toHaveBeenCalled();
  });
});

describe('frame history', () => {
  it('follows links, goes back and forward, and drops the forward entries after a new link', async () => {
    const { canGo, currentAddress, go, startHistory, visit } = await import('../components/widgets/webpages/history');
    let h = startHistory('https://a.com/');
    h = visit(h, 'https://www.a.com/'); // The first load redirected.
    expect(h.entries).toEqual(['https://www.a.com/']);
    h = visit(h, 'https://www.a.com/x');
    h = visit(h, 'https://b.com/');
    expect(canGo(h, 1)).toBe(false);
    h = go(h, -1);
    expect(currentAddress(h)).toBe('https://www.a.com/x');
    h = visit(h, 'https://www.a.com/x');
    expect(canGo(h, 1)).toBe(true);
    h = visit(h, 'https://c.com/');
    expect(h.entries).toEqual(['https://www.a.com/', 'https://www.a.com/x', 'https://c.com/']);
    expect(go(h, 1)).toBe(h); // Nothing ahead.
  });

  it('follows the browser\'s own back button instead of adding an entry', async () => {
    const { startHistory, visit } = await import('../components/widgets/webpages/history');
    let h = visit(startHistory('https://a.com/'), 'https://a.com/');
    h = visit(h, 'https://a.com/x');
    h = visit(h, 'https://a.com/');
    expect(h).toMatchObject({ entries: ['https://a.com/', 'https://a.com/x'], index: 0 });
  });
});

describe('frame messages', () => {
  it('accepts an address only from the origin it belongs to', async () => {
    const { frameLocation } = await import('../utils/frames/bridge');
    expect(frameLocation({ tabloid: 'frame-location', url: 'https://a.com/x' }, 'https://a.com')).toBe('https://a.com/x');
    expect(frameLocation({ tabloid: 'frame-location', url: 'https://b.com/' }, 'https://a.com')).toBeUndefined();
    expect(frameLocation({ tabloid: 'frame-location', url: 'javascript:1' }, 'null')).toBeUndefined();
    expect(frameLocation({ tabloid: 'other', url: 'https://a.com/' }, 'https://a.com')).toBeUndefined();
    expect(frameLocation('junk', 'https://a.com')).toBeUndefined();
  });
});
