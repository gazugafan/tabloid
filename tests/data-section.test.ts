import { readFileSync } from 'node:fs';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import DataSection from '../components/settings/DataSection.vue';
import { migrateState } from '../utils/storage/migrations';
import { buildSetupExport } from '../utils/data/exportImport';
import { createConfiguredRepository } from '../utils/sync/manager';

const download = vi.hoisted(() => vi.fn());
vi.mock('../utils/download', async (original) => ({ ...(await original<typeof import('../utils/download')>()), downloadText: download }));

const widget = (id: string, type: string, config: Record<string, unknown> = {}, y = 0) => ({ id, dashboard: 'home', type, x: 0, y, w: 4, h: 4, config });

async function seed(widgets: ReturnType<typeof widget>[]) {
  const repo = await createConfiguredRepository();
  await repo.save({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], widgets, preferences: { appearance: { radius: 3 } } });
  return repo;
}

async function choose(wrapper: ReturnType<typeof mount>, selector: string, file: File) {
  const input = wrapper.find(selector);
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await flushPromises();
}

const dialogButton = (label: string) => [...document.querySelectorAll('dialog button')].find((b) => b.textContent === label) as HTMLButtonElement;

describe('DataSection', () => {
  beforeEach(() => {
    download.mockClear();
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(true as never);
    document.body.innerHTML = '';
  });

  it('exports the setup as a dated JSON file', async () => {
    await seed([widget('n', 'notes', { text: 'hi' })]);
    const wrapper = mount(DataSection, { attachTo: document.body });
    await wrapper.findAll('.buttons button')[0]!.trigger('click');
    await flushPromises();
    const [name, text] = download.mock.calls[0]!;
    expect(name).toMatch(/^tabloid-setup-\d{4}-\d\d-\d\d\.json$/);
    expect(JSON.parse(text).widgets[0].config).toEqual({ text: 'hi' });
  });

  it('asks before replacing the setup, then replaces it', async () => {
    const repo = await seed([widget('old', 'clock')]);
    const wrapper = mount(DataSection, { attachTo: document.body });
    const file = new File([buildSetupExport({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], widgets: [widget('new1', 'notes'), widget('new2', 'notes')], preferences: {} })], 'setup.json');
    await choose(wrapper, 'input[accept*=json]', file);
    expect(document.body.textContent).toContain('This file has 2');
    expect(migrateState(await repo.load()).widgets.map((w) => w.id)).toEqual(['old']); // Nothing changed yet.
    dialogButton('Replace').click();
    await flushPromises();
    expect(migrateState(await repo.load()).widgets.map((w) => w.id)).toEqual(['new1', 'new2']);
  });

  it('refuses a file that is not a setup and leaves everything alone', async () => {
    const repo = await seed([widget('old', 'clock')]);
    const wrapper = mount(DataSection, { attachTo: document.body });
    await choose(wrapper, 'input[accept*=json]', new File(['{"hello": 1}'], 'other.json'));
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(migrateState(await repo.load()).widgets.map((w) => w.id)).toEqual(['old']);
  });

  it('imports an OPML file as one widget per folder, asking for permission first', async () => {
    const repo = await seed([widget('old', 'clock')]);
    const wrapper = mount(DataSection, { attachTo: document.body });
    await choose(wrapper, 'input[accept*=opml]', new File([readFileSync('tests/fixtures/opml/feedly.opml')], 'feeds.opml'));
    expect(document.body.textContent).toMatch(/Found 5 feeds in 4 groups/);
    dialogButton('Import').click();
    expect(browser.permissions.request).toHaveBeenCalledTimes(1); // Straight from the click.
    await flushPromises();
    const widgets = migrateState(await repo.load()).widgets;
    expect(widgets.filter((w) => w.type === 'rss')).toHaveLength(4);
    expect(widgets[0]?.id).toBe('old');
  });

  it('says so when there are no RSS feeds to export', async () => {
    await seed([widget('old', 'clock')]);
    const wrapper = mount(DataSection, { attachTo: document.body });
    await wrapper.findAll('.buttons button')[2]!.trigger('click');
    await flushPromises();
    expect(download).not.toHaveBeenCalled();
  });

  it('exports OPML for RSS widgets', async () => {
    await seed([widget('r', 'rss', { feeds: [{ url: 'https://a.test/rss', title: 'A' }] })]);
    const wrapper = mount(DataSection, { attachTo: document.body });
    await wrapper.findAll('.buttons button')[2]!.trigger('click');
    await flushPromises();
    const [name, text] = download.mock.calls[0]!;
    expect(name).toMatch(/\.opml$/);
    expect(text).toContain('xmlUrl="https://a.test/rss"');
  });
});
