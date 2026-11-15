/**
 * User-chosen look: theme, colors, corner radius and font. Stored under the "appearance" key of the
 * synced preferences. Everything here is pure so it can run (and be tested) without a DOM, apart
 * from `applyAppearance`.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

export const FONT_PRESETS = {
  system: { label: 'System default', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  humanist: { label: 'Humanist', stack: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', 'Source Sans Pro', sans-serif" },
  rounded: {
    label: 'Rounded',
    stack: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', Calibri, sans-serif",
  },
  serif: { label: 'Serif', stack: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, Georgia, serif" },
  mono: { label: 'Monospace', stack: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace" },
} as const;

export type FontPreset = keyof typeof FONT_PRESETS;

export interface Appearance {
  mode: ThemeMode;
  /** Hex color for focus rings and highlights, or null for the theme's own. */
  accent: string | null;
  /** Corner radius of widgets and controls, in px. */
  radius: number;
  font: FontPreset | 'custom';
  /** Name of an installed font; used when `font` is 'custom'. */
  customFont: string;
  /** Base text size in percent (100 = the browser's default). Every other size is relative to it. */
  fontScale: number;
  /** Page background color, or null for the theme's own. */
  background: string | null;
  /** Widget background color, or null for the theme's own. Text colors adapt to it. */
  surface: string | null;
  /** How opaque widget backgrounds are, in percent. */
  surfaceOpacity: number;
  /** Blur applied to what's behind a widget. Only visible when widgets are see-through. */
  surfaceBlur: number;
}

export const RADIUS_RANGE = { min: 0, max: 28 } as const;
/** Text size as a percentage of the browser's own default, so the user's accessibility setting still counts. */
/** Widget background opacity in percent. Low values let a background image show through. */
export const SURFACE_OPACITY_RANGE = { min: 0, max: 100 } as const;
/** Blur behind semi-transparent widgets, in px. */
export const SURFACE_BLUR_RANGE = { min: 0, max: 40 } as const;
export const FONT_SCALE_RANGE = { min: 80, max: 150, step: 5 } as const;

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'system',
  accent: null,
  radius: 12,
  font: 'system',
  customFont: '',
  fontScale: 100,
  background: null,
  surface: null,
  surfaceOpacity: 90,
  surfaceBlur: 0,
};

const HEX = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const hex = (value: unknown): string | null => (typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : null);

/** Turns untrusted stored or imported data into a valid Appearance, falling back to defaults per field. */
export function sanitizeAppearance(raw: unknown): Appearance {
  const d = DEFAULT_APPEARANCE;
  if (!isRecord(raw)) return { ...d };
  const radius = typeof raw.radius === 'number' && Number.isFinite(raw.radius) ? raw.radius : d.radius;
  return {
    mode: raw.mode === 'light' || raw.mode === 'dark' || raw.mode === 'system' ? raw.mode : d.mode,
    accent: hex(raw.accent),
    radius: Math.round(Math.min(RADIUS_RANGE.max, Math.max(RADIUS_RANGE.min, radius))),
    font: raw.font === 'custom' || (typeof raw.font === 'string' && raw.font in FONT_PRESETS) ? (raw.font as Appearance['font']) : d.font,
    customFont: typeof raw.customFont === 'string' ? cleanFontName(raw.customFont) : d.customFont,
    fontScale: typeof raw.fontScale === 'number' && Number.isFinite(raw.fontScale) ? Math.round(Math.min(FONT_SCALE_RANGE.max, Math.max(FONT_SCALE_RANGE.min, raw.fontScale))) : d.fontScale,
    background: hex(raw.background),
    surface: hex(raw.surface),
    surfaceOpacity:
      typeof raw.surfaceOpacity === 'number' && Number.isFinite(raw.surfaceOpacity)
        ? Math.round(Math.min(SURFACE_OPACITY_RANGE.max, Math.max(SURFACE_OPACITY_RANGE.min, raw.surfaceOpacity)))
        : d.surfaceOpacity,
    surfaceBlur:
      typeof raw.surfaceBlur === 'number' && Number.isFinite(raw.surfaceBlur)
        ? Math.round(Math.min(SURFACE_BLUR_RANGE.max, Math.max(SURFACE_BLUR_RANGE.min, raw.surfaceBlur)))
        : d.surfaceBlur,
  };
}

/** Keeps only characters that can appear in a font name, so it can't break out of the CSS value. */
export function cleanFontName(name: string): string {
  return name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60);
}

export function fontStack(a: Pick<Appearance, 'font' | 'customFont'>): string {
  if (a.font === 'custom' && a.customFont) return `"${a.customFont}", ${FONT_PRESETS.system.stack}`;
  return FONT_PRESETS[a.font === 'custom' ? 'system' : a.font].stack;
}

function rgb(color: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** `amount` of `b` mixed into `a` (0..1). */
export function mix(a: string, b: string, amount: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * amount) as [number, number, number]);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** CSS custom properties to set on the root element for this appearance. */
export function appearanceVars(a: Appearance): Record<string, string> {
  const vars: Record<string, string> = {
    '--radius': `${a.radius}px`,
    '--font': fontStack(a),
  };
  if (a.fontScale !== 100) vars['--font-scale'] = String(a.fontScale / 100);
  if (a.surfaceOpacity !== 100) vars['--surface-opacity'] = String(a.surfaceOpacity / 100);
  // Blur only matters when something shows through the widget.
  if (a.surfaceOpacity < 100 && a.surfaceBlur > 0) vars['--surface-blur'] = `${a.surfaceBlur}px`;
  if (a.accent) {
    vars['--accent'] = a.accent;
    // Whichever of white or near-black reads better on the chosen color.
    vars['--on-accent'] = contrast(a.accent, '#ffffff') >= contrast(a.accent, '#14161a') ? '#ffffff' : '#14161a';
  }
  if (a.background) vars['--bg'] = a.background;
  if (a.surface) {
    // Pick readable text for whatever color the user chose, and derive the related shades from it.
    const text = luminance(a.surface) > 0.4 ? '#1b1d22' : '#e8eaee';
    vars['--surface'] = a.surface;
    vars['--text'] = text;
    vars['--text-muted'] = mix(a.surface, text, 0.65);
    vars['--surface-raised'] = mix(a.surface, text, 0.08);
    vars['--border'] = mix(a.surface, text, 0.16);
  }
  return vars;
}

/** The theme's own value for each color the user can override, in the form a color input needs. */
export function themeDefaultColors(root: HTMLElement = document.documentElement): Record<'accent' | 'background' | 'surface', string> {
  const names = { accent: '--accent', background: '--bg', surface: '--surface' } as const;
  const saved = Object.values(names).map((name) => [name, root.style.getPropertyValue(name)] as const);
  // Look at the stylesheet's values by hiding the inline overrides for a moment (no repaint happens).
  for (const [name] of saved) root.style.removeProperty(name);
  const style = getComputedStyle(root);
  const read = (name: string) => style.getPropertyValue(name).trim();
  const result = { accent: read(names.accent), background: read(names.background), surface: read(names.surface) };
  for (const [name, value] of saved) if (value) root.style.setProperty(name, value);
  return result;
}

const CACHE_KEY = 'tabloid:appearance-cache';
let applied: string[] = [];

/** Applies the appearance to the page. Also remembers it so the next page load can paint it immediately. */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement): void {
  const vars = appearanceVars(a);
  for (const name of applied) if (!(name in vars)) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  applied = Object.keys(vars);
  if (a.mode === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = a.mode;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(a));
  } catch {
    // Storage may be unavailable; the stored preferences still apply once they load.
  }
}

/** Applies the last used appearance synchronously, before the stored preferences are read. */
export function applyCachedAppearance(): void {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) applyAppearance(sanitizeAppearance(JSON.parse(cached)));
  } catch {
    // Ignore a missing or corrupt cache.
  }
}
