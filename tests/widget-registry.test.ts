import { describe, expect, it } from 'vitest';
import { getWidgetDefinition, isConfigSynced, listLocalOnlyWidgets, listWidgetDefinitions, withDefaultConfig } from '../components/widgets/registry';

describe('widget registry', () => {
  it('discovers widget folders', () => {
    expect(listWidgetDefinitions().map((d) => d.type)).toEqual(['clock', 'loading-test', 'notes', 'bookmarks', 'rss', 'search', 'todo', 'weather', 'webpages']);
    expect(getWidgetDefinition('clock')?.name).toBe('Clock');
    expect(listLocalOnlyWidgets().map((d) => d.type)).toEqual(['notes', 'todo']);
    expect(isConfigSynced('notes')).toBe(false);
    expect(isConfigSynced('unknown')).toBe(true);
  });

  it('marks the sample widget as development-only', () => {
    expect(getWidgetDefinition('loading-test')?.devOnly).toBe(true);
    expect(getWidgetDefinition('rss')?.devOnly).toBeUndefined();
  });

  it('fills in config keys added after the data was saved', () => {
    expect(withDefaultConfig('clock', { hour12: true })).toMatchObject({ hour12: true, showSeconds: false, style: 'digital' });
    expect(withDefaultConfig('future', { a: 1 })).toEqual({ a: 1 });
  });
});
