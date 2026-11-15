/**
 * Sharp article thumbnails. Browsers shrink big photos to small sizes in one coarse step, which gives
 * jagged edges. Instead we shrink in halving steps (each one smooths well), keep the result at about
 * twice the displayed size so it stays crisp on dense screens, and remember it on this device.
 */

export interface ThumbSpec {
  /** The shorter side of the result, in px (about twice what is displayed). */
  minSide: number;
  /** Cap for the longer side, so panoramas don't produce huge files. */
  maxSide: number;
}

export type ThumbKind = 'thumbnail' | 'card';

export const THUMB_SPECS: Record<ThumbKind, ThumbSpec> = {
  thumbnail: { minSide: 160, maxSide: 480 },
  card: { minSide: 360, maxSide: 960 },
};

/** Final size: the shorter side becomes `minSide`, never enlarging, with the longer side capped. */
export function thumbSize(width: number, height: number, spec: ThumbSpec): { width: number; height: number } {
  const scale = Math.min(1, spec.minSide / Math.min(width, height), spec.maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Intermediate sizes for shrinking from the source to the target: halve while that stays above target. */
export function stepSizes(from: { width: number; height: number }, to: { width: number; height: number }): Array<{ width: number; height: number }> {
  const steps: Array<{ width: number; height: number }> = [];
  let current = from;
  while (current.width / 2 > to.width && current.height / 2 > to.height) {
    current = { width: Math.ceil(current.width / 2), height: Math.ceil(current.height / 2) };
    steps.push(current);
  }
  steps.push(to);
  return steps;
}

type Canvas2D = HTMLCanvasElement | OffscreenCanvas;

function createCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(canvas: Canvas2D): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
  const blob = await new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Could not encode the thumbnail.');
  return blob;
}

/** Shrinks an image to thumbnail size in smooth steps and returns it as a JPEG. */
export async function makeThumbnail(source: Blob, spec: ThumbSpec): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const target = thumbSize(bitmap.width, bitmap.height, spec);
    let from: CanvasImageSource = bitmap;
    let canvas: Canvas2D | undefined;
    for (const size of stepSizes({ width: bitmap.width, height: bitmap.height }, target)) {
      canvas = createCanvas(size.width, size.height);
      const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.fillStyle = '#fff'; // JPEG has no transparency; flatten onto white.
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(from, 0, 0, size.width, size.height);
      from = canvas;
    }
    return await canvasToBlob(canvas!);
  } finally {
    bitmap.close();
  }
}

// ---- On-device cache ----

export interface ThumbnailStore {
  get(key: string): Promise<Blob | undefined>;
  put(key: string, blob: Blob): Promise<void>;
}

const DB_NAME = 'tabloid-thumbnails';
const STORE = 'thumbs';
/** Beyond this many thumbnails, the least recently added ones are dropped. */
export const MAX_STORED_THUMBNAILS = 400;

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Thumbnail storage failed.'));
  });

export interface ClearableThumbnailStore extends ThumbnailStore {
  clear(): Promise<void>;
}

export function createIndexedDbThumbnailStore(options: { dbName?: string; max?: number } = {}): ClearableThumbnailStore {
  const { dbName = DB_NAME, max = MAX_STORED_THUMBNAILS } = options;
  let opened: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opened ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('at', 'at');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open thumbnail storage.'));
    }));
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE);

  return {
    async get(key) {
      const row = (await request((await store('readonly')).get(key))) as { blob: Blob } | undefined;
      return row?.blob;
    },
    async put(key, blob) {
      const rows = await store('readwrite');
      await request(rows.put({ key, blob, at: Date.now() }));
      const count = await request((await store('readonly')).count());
      if (count <= max) return;
      // Drop the oldest few hundred KB-sized entries so this doesn't run on every insert.
      const excess = count - Math.round(max * 0.8);
      const keys = (await request((await store('readonly')).index('at').getAllKeys(undefined, excess))) as IDBValidKey[];
      const writer = await store('readwrite');
      // getAllKeys on an index returns primary keys.
      for (const oldKey of keys) writer.delete(oldKey);
    },
    async clear() {
      await request((await store('readwrite')).clear());
    },
  };
}

// ---- Loading ----

export interface ThumbnailDeps {
  fetchBlob: (url: string) => Promise<Blob>;
  make: (source: Blob, spec: ThumbSpec) => Promise<Blob>;
  store: ThumbnailStore;
}

export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;

export async function fetchImageBlob(url: string, fetchFn: typeof fetch = fetch): Promise<Blob> {
  const response = await fetchFn(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
  const blob = await response.blob();
  if (blob.size > MAX_SOURCE_IMAGE_BYTES) throw new Error('Image is too large.');
  return blob;
}

/** Whether this browser can make thumbnails (otherwise the original image is shown as is). */
export const thumbnailsSupported = () => typeof createImageBitmap === 'function' && typeof indexedDB !== 'undefined';

/** Runs at most `limit` tasks at once, so a long feed doesn't freeze the page decoding photos. */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

const limit = createLimiter(3);
const inFlight = new Map<string, Promise<Blob>>();
let defaultStore: ThumbnailStore | undefined;

function defaults(): ThumbnailDeps {
  return { fetchBlob: (url) => fetchImageBlob(url), make: makeThumbnail, store: (defaultStore ??= createIndexedDbThumbnailStore()) };
}

/** Returns the thumbnail for an image address: from the device cache, or made now and cached. */
export function loadThumbnail(url: string, kind: ThumbKind, deps: ThumbnailDeps = defaults()): Promise<Blob> {
  const key = `${kind}|${url}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const stored = await deps.store.get(key).catch(() => undefined);
    if (stored) return stored;
    const made = await limit(async () => deps.make(await deps.fetchBlob(url), THUMB_SPECS[kind]));
    await deps.store.put(key, made).catch(() => undefined); // Failing to cache isn't worth failing the image.
    return made;
  })();
  inFlight.set(key, promise);
  promise.finally(() => inFlight.delete(key)).catch(() => undefined);
  return promise;
}
