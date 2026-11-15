import type { FetchFn } from '../sync/shared';
import type { ApiKeys } from './keys';
import type { Candidate } from './picker';
import { ALL, BING_MARKETS, WIKIMEDIA_CATEGORIES, type BackgroundSettings } from './settings';
import { htmlToText } from '../rss/text';

/** A public image feed. Fetching its list needs permission to contact `origins`. */
export interface RemoteBackgroundSource {
  id: 'bing' | 'wikimedia' | 'unsplash';
  label: string;
  origins: string[];
  /** More sites some options need (asked for when that option is chosen). */
  optionOrigins?: string[];
  /** Roughly how often the source publishes new images; the cached list is reused this long. */
  ttlMs: number;
  /** Which API key the source needs, if any. Without it the source is skipped. */
  requiresKey?: keyof ApiKeys;
  /** Changing this value makes the cached list stale (e.g. a search topic). */
  variant?(settings: BackgroundSettings): string;
  load(fetchFn: FetchFn, keys: ApiKeys, settings: BackgroundSettings): Promise<Candidate[]>;
}

const HOUR = 60 * 60 * 1000;

async function getJson(fetchFn: FetchFn, url: string, name: string, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetchFn(url, { cache: 'no-store', headers });
  if (response.status === 429) throw new Error(`${name} rate limit reached.`);
  if (response.status === 401 || response.status === 403) throw new Error(`${name} rejected the API key.`);
  if (!response.ok) throw new Error(`${name} request failed (${response.status}).`);
  return response.json();
}

/** Drops candidates whose id was already seen. */
const unique = (list: Candidate[]): Candidate[] => [...new Map(list.map((c) => [c.id, c])).values()];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---- Bing ----

const BING_ORIGIN = 'https://www.bing.com';

/** Turns Bing's HPImageArchive response into candidates (most recent first). */
export function parseBing(data: unknown): Candidate[] {
  const images = isRecord(data) ? data.images : undefined;
  if (!Array.isArray(images)) throw new Error('Bing returned an unexpected response.');
  const candidates: Candidate[] = [];
  for (const image of images as Array<Record<string, unknown>>) {
    const base = image.urlbase;
    if (typeof base !== 'string' || !base.startsWith('/')) continue;
    candidates.push({
      id: `bing:${typeof image.hsh === 'string' ? image.hsh : base}`,
      source: 'bing',
      url: `${BING_ORIGIN}${base}_1920x1080.jpg`,
      title: typeof image.title === 'string' ? image.title : undefined,
      credit: typeof image.copyright === 'string' ? image.copyright : undefined,
    });
  }
  return candidates;
}

export const BING_SOURCE: RemoteBackgroundSource = {
  id: 'bing',
  label: 'Bing daily image',
  origins: [`${BING_ORIGIN}/*`],
  ttlMs: 12 * HOUR,
  variant: (settings) => settings.bingMarket,
  async load(fetchFn, _keys, settings) {
    const fetchMarket = async (market: string, count: number) =>
      parseBing(await getJson(fetchFn, `${BING_ORIGIN}/HPImageArchive.aspx?format=js&idx=0&n=${count}&mkt=${encodeURIComponent(market)}`, 'Bing'));
    if (settings.bingMarket !== ALL) return fetchMarket(settings.bingMarket, 8);
    // Every region, a few recent photos each. Regions often share a photo, so duplicates are dropped.
    const results = await Promise.allSettled(BING_MARKETS.map((m) => fetchMarket(m.id, 4)));
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    const candidates = unique(results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])));
    if (candidates.length === 0 && failure) throw failure.reason;
    return candidates;
  },
};

// ---- Wikimedia Commons Picture of the Day ----

const WIKIMEDIA_FEED = 'https://api.wikimedia.org/feed/v1/wikipedia/en/featured';
const WIDE = 1920;

/** Originals come from upload.wikimedia.org, resized thumbnails from thumb.wikimedia.org. */
const WIKIMEDIA_IMAGE_HOSTS = ['upload.wikimedia.org', 'thumb.wikimedia.org'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Reads one day of the featured feed; null when that day has no usable picture. */
export function parseWikimedia(data: unknown): Candidate | null {
  const image = isRecord(data) && isRecord(data.image) ? data.image : null;
  if (!image || typeof image.title !== 'string') return null;
  const thumb = isRecord(image.thumbnail) ? image.thumbnail : null;
  const original = isRecord(image.image) ? image.image : null;
  let url: string | undefined;
  if (original && typeof original.source === 'string' && typeof original.width === 'number' && original.width < WIDE) {
    url = original.source; // Already smaller than the target size: use it as is.
  } else if (thumb && typeof thumb.source === 'string') {
    // Commons serves thumbnails at any size up to the original's; ask for a screen-sized one.
    url = thumb.source.replace(/\/\d+px-/, `/${WIDE}px-`);
  }
  if (!url || !WIKIMEDIA_IMAGE_HOSTS.some((host) => url.startsWith(`https://${host}/`))) return null;
  const description = isRecord(image.description) && typeof image.description.text === 'string' ? image.description.text : undefined;
  const artist = isRecord(image.artist) && typeof image.artist.text === 'string' ? image.artist.text : undefined;
  const page = typeof image.file_page === 'string' ? image.file_page : undefined;
  return {
    id: `wikimedia:${image.title}`,
    source: 'wikimedia',
    url,
    title: description ?? image.title.replace(/^File:/, ''),
    credit: artist ? `${artist} via Wikimedia Commons` : 'Wikimedia Commons',
    link: page?.startsWith('https://commons.wikimedia.org/') ? page : undefined,
  };
}

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_ORIGIN = 'https://commons.wikimedia.org/*';

/**
 * Reads the pictures of a Commons category (a generator query with image info). Only photos that suit a
 * screen are kept: landscape-shaped (not tall, not extreme panoramas) and big enough to look sharp.
 */
export function parseCommonsCategory(data: unknown): Candidate[] {
  const pages = isRecord(data) && isRecord(data.query) && Array.isArray(data.query.pages) ? (data.query.pages as unknown[]) : [];
  const candidates: Candidate[] = [];
  for (const page of pages) {
    if (!isRecord(page) || typeof page.title !== 'string' || !Array.isArray(page.imageinfo) || !isRecord(page.imageinfo[0])) continue;
    const info = page.imageinfo[0];
    const { width, height } = info;
    if (typeof width !== 'number' || typeof height !== 'number' || height <= 0) continue;
    if (width < 1600 || width / height < 1.3 || width / height > 2.4) continue;
    if (typeof info.mime !== 'string' || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) continue;
    const source = width > WIDE ? info.thumburl : info.url;
    if (typeof source !== 'string') continue;
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || !WIKIMEDIA_IMAGE_HOSTS.includes(url.hostname)) continue;
    url.search = '';
    const meta = isRecord(info.extmetadata) ? info.extmetadata : {};
    const field = (name: string) => (isRecord(meta[name]) && typeof meta[name].value === 'string' ? htmlToText(meta[name].value) : undefined);
    const artist = field('Artist');
    const page_ = typeof info.descriptionurl === 'string' && info.descriptionurl.startsWith('https://commons.wikimedia.org/') ? info.descriptionurl : undefined;
    candidates.push({
      id: `wikimedia:${page.title}`,
      source: 'wikimedia',
      url: url.toString(),
      title: field('ObjectName') || page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
      credit: artist ? `${artist.slice(0, 80)} via Wikimedia Commons` : 'Wikimedia Commons',
      link: page_,
    });
  }
  return candidates;
}

async function loadCommonsCategory(fetchFn: FetchFn, category: string): Promise<Candidate[]> {
  const base = {
    action: 'query', generator: 'categorymembers', gcmtitle: `Category:${category}`, gcmtype: 'file', gcmlimit: '40', gcmsort: 'sortkey',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(WIDE), iiextmetadatafilter: 'ObjectName|Artist',
    format: 'json', formatversion: '2', origin: '*',
  };
  const query = (extra: Record<string, string>) => `${COMMONS_API}?${new URLSearchParams({ ...base, ...extra })}`;
  // Start somewhere random in the category so each fetch is a different sample.
  const randomStart = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  let candidates = parseCommonsCategory(await getJson(fetchFn, query({ gcmstarthexsortkey: randomStart }), 'Wikimedia'));
  // Landed near the end of the list: take the beginning instead.
  if (candidates.length < 6) candidates = [...candidates, ...parseCommonsCategory(await getJson(fetchFn, query({}), 'Wikimedia'))];
  return candidates.slice(0, 12);
}

async function loadPicturesOfTheDay(fetchFn: FetchFn): Promise<Candidate[]> {
  // One request per day for the past week gives a small rotation.
  const requests = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - i * 24 * HOUR);
    return getJson(fetchFn, `${WIKIMEDIA_FEED}/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`, 'Wikimedia');
  });
  const results = await Promise.allSettled(requests);
  const candidates = results.flatMap((r) => (r.status === 'fulfilled' ? [parseWikimedia(r.value)] : [])).filter((c): c is Candidate => c !== null);
  if (candidates.length === 0) {
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failure) throw failure.reason;
  }
  return candidates;
}

export const WIKIMEDIA_SOURCE: RemoteBackgroundSource = {
  id: 'wikimedia',
  label: 'Wikimedia Commons pictures',
  origins: ['https://api.wikimedia.org/*'],
  optionOrigins: [COMMONS_ORIGIN],
  ttlMs: 12 * HOUR,
  variant: (settings) => settings.wikimediaCategory,
  async load(fetchFn, _keys, settings) {
    const choice = settings.wikimediaCategory;
    const category = WIKIMEDIA_CATEGORIES.find((c) => c.id === choice);
    if (category) return loadCommonsCategory(fetchFn, category.category);
    if (choice !== ALL) return loadPicturesOfTheDay(fetchFn);
    // A bit of everything: the last week's pictures of the day, plus a few from four random subjects.
    const subjects = [...WIKIMEDIA_CATEGORIES].sort(() => Math.random() - 0.5).slice(0, 4);
    const results = await Promise.allSettled([
      loadPicturesOfTheDay(fetchFn),
      ...subjects.map(async (s) => (await loadCommonsCategory(fetchFn, s.category)).slice(0, 5)),
    ]);
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    const candidates = unique(results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])));
    if (candidates.length === 0 && failure) throw failure.reason;
    return candidates;
  },
};

// ---- Unsplash ----

/** Reads a /photos/random response. Photos are hotlinked and credited, as Unsplash requires. */
export function parseUnsplash(data: unknown): Candidate[] {
  if (!Array.isArray(data)) throw new Error('Unsplash returned an unexpected response.');
  const candidates: Candidate[] = [];
  for (const photo of data as unknown[]) {
    if (!isRecord(photo) || typeof photo.id !== 'string' || !isRecord(photo.urls) || typeof photo.urls.raw !== 'string') continue;
    if (!photo.urls.raw.startsWith('https://images.unsplash.com/')) continue;
    const user = isRecord(photo.user) && typeof photo.user.name === 'string' ? photo.user.name : undefined;
    const links = isRecord(photo.links) ? photo.links : {};
    candidates.push({
      id: `unsplash:${photo.id}`,
      source: 'unsplash',
      url: `${photo.urls.raw}${photo.urls.raw.includes('?') ? '&' : '?'}w=${WIDE}&q=80&fit=max&fm=jpg`,
      title: typeof photo.description === 'string' ? photo.description : undefined,
      credit: user ? `Photo by ${user} on Unsplash` : 'Photo from Unsplash',
      link: typeof links.html === 'string' && links.html.startsWith('https://unsplash.com/') ? links.html : undefined,
      trackUrl: typeof links.download_location === 'string' && links.download_location.startsWith('https://api.unsplash.com/') ? links.download_location : undefined,
    });
  }
  return candidates;
}

export const UNSPLASH_SOURCE: RemoteBackgroundSource = {
  id: 'unsplash',
  label: 'Unsplash photos',
  origins: ['https://api.unsplash.com/*'],
  ttlMs: 24 * HOUR,
  requiresKey: 'unsplash',
  variant: (settings) => settings.unsplashQuery,
  async load(fetchFn, keys, settings) {
    const query = settings.unsplashQuery ? `&query=${encodeURIComponent(settings.unsplashQuery)}` : '';
    const url = `https://api.unsplash.com/photos/random?count=10&orientation=landscape${query}`;
    return parseUnsplash(await getJson(fetchFn, url, 'Unsplash', { Authorization: `Client-ID ${keys.unsplash}` }));
  },
};

export const REMOTE_BACKGROUND_SOURCES: readonly RemoteBackgroundSource[] = [BING_SOURCE, WIKIMEDIA_SOURCE, UNSPLASH_SOURCE];
