/** Background image preferences. Stored under the "background" key of the synced preferences. */

export type RotateEvery = 'tab' | 'hour' | 'day' | 'never';

export const ROTATE_OPTIONS: ReadonlyArray<{ value: RotateEvery; label: string }> = [
  { value: 'tab', label: 'Every new tab' },
  { value: 'hour', label: 'Every hour' },
  { value: 'day', label: 'Every day' },
  { value: 'never', label: 'Never (keep the current image)' },
];

export const ROTATE_MS: Record<Exclude<RotateEvery, 'tab' | 'never'>, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

/** The choice that mixes everything the source offers (every Bing region, or all Wikimedia subjects). */
export const ALL = 'all';

/** Bing shows different photos in each region. */
export const BING_MARKETS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'en-US', label: 'United States' },
  { id: 'en-GB', label: 'United Kingdom' },
  { id: 'en-CA', label: 'Canada' },
  { id: 'en-AU', label: 'Australia' },
  { id: 'en-IN', label: 'India' },
  { id: 'de-DE', label: 'Germany' },
  { id: 'fr-FR', label: 'France' },
  { id: 'es-ES', label: 'Spain' },
  { id: 'it-IT', label: 'Italy' },
  { id: 'pt-BR', label: 'Brazil' },
  { id: 'ja-JP', label: 'Japan' },
  { id: 'zh-CN', label: 'China' },
];

/** Commons' featured pictures, by subject. Each is a Commons category that holds pictures directly. */
export const WIKIMEDIA_CATEGORIES: ReadonlyArray<{ id: string; label: string; category: string }> = [
  { id: 'landscapes', label: 'Landscapes', category: 'Featured pictures of landscapes' },
  { id: 'mountains', label: 'Mountains', category: 'Featured pictures of mountains' },
  { id: 'lakes', label: 'Lakes', category: 'Featured pictures of lakes' },
  { id: 'waterfalls', label: 'Waterfalls', category: 'Featured pictures of waterfalls' },
  { id: 'forests', label: 'Forests', category: 'Featured pictures of forests' },
  { id: 'beaches', label: 'Beaches', category: 'Featured pictures of beaches' },
  { id: 'sunsets', label: 'Sunsets', category: 'Featured pictures of sunsets' },
  { id: 'clouds', label: 'Clouds', category: 'Featured pictures of clouds' },
  { id: 'cityscapes', label: 'Cityscapes', category: 'Featured pictures of cityscapes' },
  { id: 'bridges', label: 'Bridges', category: 'Featured pictures of bridges' },
  { id: 'castles', label: 'Castles', category: 'Featured pictures of castles' },
  { id: 'flowers', label: 'Flowers', category: 'Featured pictures of flowers' },
];

/** Ready-made Unsplash topics (the search words sent to Unsplash). Anything else is a custom topic. */
export const UNSPLASH_TOPICS: ReadonlyArray<{ query: string; label: string }> = [
  { query: 'nature', label: 'Nature' },
  { query: 'mountains', label: 'Mountains' },
  { query: 'ocean', label: 'Ocean and beaches' },
  { query: 'forest', label: 'Forests' },
  { query: 'architecture', label: 'Architecture' },
  { query: 'city at night', label: 'City at night' },
  { query: 'travel', label: 'Travel' },
  { query: 'animals', label: 'Animals' },
  { query: 'space', label: 'Space' },
  { query: 'textures patterns', label: 'Textures and patterns' },
  { query: 'minimal', label: 'Minimal' },
  { query: 'street photography', label: 'Street photography' },
];

export const BLUR_RANGE = { min: 0, max: 40 } as const;
export const DIM_RANGE = { min: 0, max: 95 } as const;

export interface BackgroundSettings {
  /** Use the images uploaded on this device. */
  uploads: boolean;
  /** Use Bing's daily images. */
  bing: boolean;
  /** Which Bing region's photos to use: a market code such as en-US, or ALL. */
  bingMarket: string;
  /** Use Wikimedia Commons' Picture of the Day, or featured pictures of one subject. */
  wikimedia: boolean;
  /** A WIKIMEDIA_CATEGORIES id, ALL, or '' for the Picture of the Day. */
  wikimediaCategory: string;
  /** Use random Unsplash photos (needs the user's own API key). */
  unsplash: boolean;
  /** Optional topic for Unsplash photos, e.g. "mountains". */
  unsplashQuery: string;
  rotate: RotateEvery;
  /** Darkens the image by this many percent so widgets stay readable. */
  dim: number;
  /** Blurs the image by this many px. */
  blur: number;
}

export const DEFAULT_BACKGROUND: BackgroundSettings = {
  uploads: true,
  bing: false,
  bingMarket: ALL,
  wikimedia: false,
  wikimediaCategory: '',
  unsplash: false,
  unsplashQuery: '',
  rotate: 'day',
  dim: 20,
  blur: 0,
};

export function sanitizeBackground(raw: unknown): BackgroundSettings {
  const d = DEFAULT_BACKGROUND;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  const dim = typeof r.dim === 'number' && Number.isFinite(r.dim) ? r.dim : d.dim;
  return {
    uploads: typeof r.uploads === 'boolean' ? r.uploads : d.uploads,
    bing: typeof r.bing === 'boolean' ? r.bing : d.bing,
    bingMarket: r.bingMarket === ALL || BING_MARKETS.some((m) => m.id === r.bingMarket) ? (r.bingMarket as string) : d.bingMarket,
    wikimedia: typeof r.wikimedia === 'boolean' ? r.wikimedia : d.wikimedia,
    wikimediaCategory: r.wikimediaCategory === ALL || WIKIMEDIA_CATEGORIES.some((c) => c.id === r.wikimediaCategory) ? (r.wikimediaCategory as string) : d.wikimediaCategory,
    unsplash: typeof r.unsplash === 'boolean' ? r.unsplash : d.unsplash,
    unsplashQuery: typeof r.unsplashQuery === 'string' ? r.unsplashQuery.replace(/[^\p{L}\p{N} ,'-]/gu, '').trim().slice(0, 50) : d.unsplashQuery,
    rotate: ROTATE_OPTIONS.some((o) => o.value === r.rotate) ? (r.rotate as RotateEvery) : d.rotate,
    dim: Math.round(Math.min(DIM_RANGE.max, Math.max(DIM_RANGE.min, dim))),
    blur: Math.round(Math.min(BLUR_RANGE.max, Math.max(BLUR_RANGE.min, typeof r.blur === 'number' && Number.isFinite(r.blur) ? r.blur : d.blur))),
  };
}
