import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAppearance, DEFAULT_APPEARANCE } from '../utils/appearance';

const script = readFileSync('public/early.js', 'utf-8');
const runEarly = () => new Function(script)();

/** Node ships its own half-working localStorage that hides the test DOM's; use a plain one. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

describe('early paint script', () => {
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('applies the saved theme and page color, as the app itself would', () => {
    // Save the look the same way the app does, then check the script reads it back.
    applyAppearance({ ...DEFAULT_APPEARANCE, mode: 'dark', background: '#102030' });
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
    runEarly();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#102030');
  });

  it('leaves the theme to the system when set to follow it, and ignores bad data', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, mode: 'system' });
    runEarly();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    localStorage.setItem('tabloid:appearance-cache', '{not json');
    expect(runEarly).not.toThrow();
    localStorage.setItem('tabloid:appearance-cache', JSON.stringify({ mode: 'neon', background: 'url(evil)' }));
    runEarly();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
  });
});

describe('early page colors', () => {
  const early = readFileSync('public/early.css', 'utf-8');
  const base = readFileSync('assets/base.css', 'utf-8');

  it('match the theme colors in the main stylesheet, so the page never changes color when it loads', () => {
    const light = /--bg: (#[0-9a-f]{6})/i.exec(base)![1];
    const dark = /--bg: (#[0-9a-f]{6})/gi.exec(base.slice(base.indexOf('prefers-color-scheme')))![1];
    expect(early).toContain(`var(--bg, ${light})`);
    expect(early).toContain(`var(--bg, ${dark})`);
  });

  it('are painted by html, never body, so the background image (behind the content) stays visible', () => {
    // html has a background (from early.css), so a body background would paint as its own box, over the
    // fixed z-index -1 background image, wherever there is content.
    const body = /^body \{([^}]*)\}/m.exec(base)![1];
    expect(body).not.toMatch(/background/);
    expect(base).toMatch(/^html \{[^}]*background: var\(--bg\)/m);
  });

  it('is linked, with the script and a color-scheme hint, from both pages', () => {
    for (const page of ['entrypoints/newtab/index.html', 'entrypoints/options/index.html']) {
      const html = readFileSync(page, 'utf-8');
      expect(html).toContain('<meta name="color-scheme" content="light dark" />');
      expect(html).toContain('href="/early.css"');
      expect(html).toContain('src="/early.js"');
      expect(html.indexOf('/early.js')).toBeLessThan(html.indexOf('main.ts')); // Runs before the app.
    }
  });
});
