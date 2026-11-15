import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyAppearance,
  appearanceVars,
  cleanFontName,
  DEFAULT_APPEARANCE,
  FONT_SCALE_RANGE,
  SURFACE_OPACITY_RANGE,
  fontStack,
  contrast,
  luminance,
  mix,
  sanitizeAppearance,
} from '../utils/appearance';
import { createSingleKeyRepository } from '../utils/storage/repository';
import { loadPreferences, savePreference } from '../utils/sync/preferences';
import { memoryStore } from './helpers';

describe('sanitizeAppearance', () => {
  it('falls back to defaults for junk', () => {
    expect(sanitizeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(sanitizeAppearance({ mode: 'neon', accent: 'red', radius: 'x', font: 'comic', background: '#12' })).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps valid values, clamps the radius and lowercases colors', () => {
    const a = sanitizeAppearance({ mode: 'dark', accent: '#AABBCC', radius: 99, font: 'mono', surface: '#102030' });
    expect(a).toMatchObject({ mode: 'dark', accent: '#aabbcc', radius: 28, font: 'mono', surface: '#102030' });
    expect(sanitizeAppearance({ radius: -5 }).radius).toBe(0);
  });
});

describe('surface opacity', () => {
  it('is clamped, and only emitted when not fully opaque', () => {
    expect(sanitizeAppearance({ surfaceOpacity: -20 }).surfaceOpacity).toBe(SURFACE_OPACITY_RANGE.min);
    expect(sanitizeAppearance({ surfaceOpacity: 'x' }).surfaceOpacity).toBe(DEFAULT_APPEARANCE.surfaceOpacity);
    expect(appearanceVars({ ...DEFAULT_APPEARANCE, surfaceOpacity: 60 })['--surface-opacity']).toBe('0.6');
    expect(appearanceVars({ ...DEFAULT_APPEARANCE, surfaceOpacity: 100 })['--surface-opacity']).toBeUndefined();
  });
});

describe('surface blur', () => {
  it('is clamped and only applied to see-through widgets', () => {
    expect(sanitizeAppearance({ surfaceBlur: 999 }).surfaceBlur).toBe(40);
    expect(appearanceVars({ ...DEFAULT_APPEARANCE, surfaceBlur: 12, surfaceOpacity: 100 })['--surface-blur']).toBeUndefined();
    expect(appearanceVars({ ...DEFAULT_APPEARANCE, surfaceBlur: 12, surfaceOpacity: 70 })['--surface-blur']).toBe('12px');
  });
});

describe('font scale', () => {
  it('is clamped to its range', () => {
    expect(sanitizeAppearance({ fontScale: 500 }).fontScale).toBe(FONT_SCALE_RANGE.max);
    expect(sanitizeAppearance({ fontScale: 1 }).fontScale).toBe(FONT_SCALE_RANGE.min);
    expect(sanitizeAppearance({ fontScale: 'big' }).fontScale).toBe(100);
  });
});

describe('fonts', () => {
  it('strips characters that could break out of the CSS value', () => {
    expect(cleanFontName('Inter"; background: url(x)')).toBe('Inter background urlx');
    expect(fontStack({ font: 'custom', customFont: 'Inter' })).toMatch(/^"Inter", system-ui/);
    expect(fontStack({ font: 'custom', customFont: '' })).toBe(fontStack({ font: 'system', customFont: '' }));
  });
});

describe('appearanceVars', () => {
  it('only overrides what the user chose', () => {
    expect(appearanceVars({ ...DEFAULT_APPEARANCE, fontScale: 125 })['--font-scale']).toBe('1.25');
    expect(Object.keys(appearanceVars(DEFAULT_APPEARANCE)).sort()).toEqual(['--font', '--radius', '--surface-opacity']);
  });

  it('derives readable text for a dark or light widget color', () => {
    const dark = appearanceVars({ ...DEFAULT_APPEARANCE, surface: '#101820' });
    const light = appearanceVars({ ...DEFAULT_APPEARANCE, surface: '#fff8e0' });
    expect(dark['--text']).toBe('#e8eaee');
    expect(light['--text']).toBe('#1b1d22');
    expect(luminance('#000000')).toBe(0);
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('text on the accent color', () => {
  it('picks white or near-black, whichever reads better', () => {
    expect(appearanceVars({ ...DEFAULT_APPEARANCE, accent: '#2f5bd8' })['--on-accent']).toBe('#ffffff');
    expect(appearanceVars({ ...DEFAULT_APPEARANCE, accent: '#f5c542' })['--on-accent']).toBe('#14161a');
  });

  it('meets WCAG AA (4.5:1) for the theme defaults', () => {
    const css = readFileSync('assets/base.css', 'utf8');
    const values = (name: string) => [...css.matchAll(new RegExp(`--${name}: (#[0-9a-f]{6})`, 'g'))].map((m) => m[1]!);
    const [accents, onAccents, backgrounds, muted] = [values('accent'), values('on-accent'), values('bg'), values('text-muted')];
    expect(accents.length).toBe(3);
    accents.forEach((accent, i) => {
      expect(contrast(accent, onAccents[i]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted[i]!, backgrounds[i]!)).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('applyAppearance', () => {
  it('sets the theme and removes overrides that are no longer used', () => {
    const root = document.createElement('div');
    applyAppearance({ ...DEFAULT_APPEARANCE, mode: 'dark', accent: '#ff0000' }, root);
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.getPropertyValue('--accent')).toBe('#ff0000');
    applyAppearance(DEFAULT_APPEARANCE, root);
    expect(root.dataset.theme).toBeUndefined();
    expect(root.style.getPropertyValue('--accent')).toBe('');
  });
});

describe('preferences access', () => {
  it('saves one section without disturbing the layout or other sections', async () => {
    const repo = createSingleKeyRepository(memoryStore());
    await repo.save({ version: 3, dashboards: [{ id: 'home', name: 'Home' }], widgets: [{ id: 'a', dashboard: 'home', type: 'clock', x: 0, y: 0, w: 2, h: 2, config: {} }], preferences: { other: 1 } });
    await savePreference('appearance', { radius: 4 }, repo);
    expect(await loadPreferences(repo)).toEqual({ other: 1, appearance: { radius: 4 } });
    expect((await repo.load())?.widgets).toHaveLength(1);
  });

  it('works before anything has been saved', async () => {
    const repo = createSingleKeyRepository(memoryStore());
    expect(await loadPreferences(repo)).toEqual({});
    await savePreference('appearance', { radius: 4 }, repo);
    expect(await loadPreferences(repo)).toEqual({ appearance: { radius: 4 } });
  });
});
