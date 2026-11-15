import { describe, expect, it } from 'vitest';
import { emptyState, migrateState } from '../utils/storage/migrations';

const widget = { id: 'a', dashboard: 'home', type: 'clock', x: 0, y: 0, w: 3, h: 3, config: { hour12: true } };

describe('migrateState', () => {
  it('accepts a valid current-version document', () => {
    expect(migrateState({ version: 1, widgets: [widget] }).widgets).toEqual([widget]);
  });

  it('drops malformed widgets but keeps valid ones', () => {
    const state = migrateState({ version: 1, widgets: [widget, { id: 'b' }, null, 'x', { ...widget, id: 'c', x: NaN }] });
    expect(state.widgets.map((w) => w.id)).toEqual(['a']);
  });

  it('defaults a missing config to an empty object', () => {
    const { config: _config, ...rest } = widget;
    expect(migrateState({ version: 1, widgets: [rest] }).widgets[0]?.config).toEqual({});
  });

  it('keeps widgets of unknown types so data survives', () => {
    expect(migrateState({ version: 1, widgets: [{ ...widget, type: 'future' }] }).widgets).toHaveLength(1);
  });

  it('rejects non-objects, missing versions, and newer versions', () => {
    expect(() => migrateState(null)).toThrow();
    expect(() => migrateState([])).toThrow();
    expect(() => migrateState({ widgets: [] })).toThrow(/version/);
    expect(() => migrateState({ version: 999, widgets: [] })).toThrow(/newer/);
  });

  it('rejects versions with no migration path', () => {
    expect(() => migrateState({ version: 0, widgets: [] })).toThrow(/No migration/);
  });

  it('produces an empty current-version state', () => {
    expect(emptyState()).toEqual({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], widgets: [], preferences: {} });
  });

  it('upgrades a version 1 document, adding empty preferences', () => {
    const state = migrateState({ version: 1, widgets: [] });
    expect(state).toEqual({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], widgets: [], preferences: {} });
  });

  it('keeps preferences, including keys it does not know about', () => {
    const prefs = { appearance: { radius: 8 }, future: [1] };
    expect(migrateState({ version: 3, widgets: [], preferences: prefs }).preferences).toEqual(prefs);
    expect(migrateState({ version: 3, widgets: [], preferences: 'junk' }).preferences).toEqual({});
  });

  it('keeps the transparent flag only when it is exactly true', () => {
    const state = migrateState({ version: 2, widgets: [{ ...widget, transparent: true }, { ...widget, id: 'b', transparent: 'yes' }, { ...widget, id: 'c', transparent: false }] });
    expect(state.widgets.map((w) => w.transparent)).toEqual([true, undefined, undefined]);
  });
});

describe('dashboards', () => {
  const widgetOn = (id: string, dashboard?: string) => ({ id, type: 'clock', x: 0, y: 0, w: 2, h: 2, config: {}, ...(dashboard ? { dashboard } : {}) });

  it('upgrades a version 2 document: everything lands on one "Home" dashboard', () => {
    const state = migrateState({ version: 2, widgets: [widgetOn('a'), widgetOn('b')], preferences: { appearance: { radius: 3 } } });
    expect(state.version).toBe(3);
    expect(state.dashboards).toEqual([{ id: 'home', name: 'Home' }]);
    expect(state.widgets.map((w) => w.dashboard)).toEqual(['home', 'home']);
    expect(state.preferences).toEqual({ appearance: { radius: 3 } });
  });

  it('keeps valid dashboards in order, with tidy names and unique ids', () => {
    const state = migrateState({
      version: 3,
      dashboards: [{ id: 'a', name: '  News   today ' }, { id: 'a', name: 'dup' }, { id: 'b', name: '' }, { id: 5 }, 'x', { id: 'c', name: 'x'.repeat(100) }],
      widgets: [],
    });
    expect(state.dashboards.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(state.dashboards[0]?.name).toBe('News today');
    expect(state.dashboards[1]?.name).toBe('Dashboard');
    expect(state.dashboards[2]?.name).toHaveLength(40);
  });

  it('never ends up with no dashboards, and rehomes widgets that point at a missing one', () => {
    const empty = migrateState({ version: 3, dashboards: [], widgets: [widgetOn('a', 'gone')] });
    expect(empty.dashboards).toEqual([{ id: 'home', name: 'Home' }]);
    expect(empty.widgets[0]?.dashboard).toBe('home');
    const two = migrateState({ version: 3, dashboards: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }], widgets: [widgetOn('a', 'y'), widgetOn('b', 'nope'), widgetOn('c')] });
    expect(two.widgets.map((w) => w.dashboard)).toEqual(['y', 'x', 'x']);
  });

  it('validates a dashboard\'s own background settings and drops junk', () => {
    const state = migrateState({
      version: 3,
      dashboards: [{ id: 'a', name: 'A', background: { dim: 9999, rotate: 'bogus', bing: true } }, { id: 'b', name: 'B', background: 'nope' }],
      widgets: [],
    });
    expect(state.dashboards[0]?.background).toMatchObject({ bing: true, rotate: 'day', dim: 95 });
    expect(state.dashboards[1]?.background).toBeUndefined();
  });

  it('limits how many dashboards there can be', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, name: `D${i}` }));
    expect(migrateState({ version: 3, dashboards: many, widgets: [] }).dashboards).toHaveLength(20);
  });
});
