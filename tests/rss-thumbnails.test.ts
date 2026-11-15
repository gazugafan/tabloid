import { describe, expect, it, vi } from 'vitest';
import { createLimiter, loadThumbnail, stepSizes, thumbSize, THUMB_SPECS, type ThumbnailDeps, type ThumbnailStore } from '../utils/rss/thumbnails';

describe('thumbSize', () => {
  it('scales so the shorter side matches, keeping proportions', () => {
    expect(thumbSize(4000, 3000, THUMB_SPECS.thumbnail)).toEqual({ width: 213, height: 160 });
    expect(thumbSize(3000, 4000, THUMB_SPECS.thumbnail)).toEqual({ width: 160, height: 213 });
  });
  it('never enlarges small images', () => {
    expect(thumbSize(100, 80, THUMB_SPECS.thumbnail)).toEqual({ width: 100, height: 80 });
  });
  it('caps the longer side of panoramas', () => {
    const size = thumbSize(10000, 500, THUMB_SPECS.thumbnail);
    expect(size.width).toBe(480);
    expect(size.height).toBe(24);
  });
});

describe('stepSizes', () => {
  it('halves repeatedly and ends exactly at the target', () => {
    const steps = stepSizes({ width: 4000, height: 3000 }, { width: 213, height: 160 });
    expect(steps.at(-1)).toEqual({ width: 213, height: 160 });
    expect(steps.length).toBeGreaterThan(3);
    for (let i = 1; i < steps.length - 1; i++) expect(steps[i]!.width).toBeLessThan(steps[i - 1]!.width);
    // No step shrinks by more than half (that is what keeps the result smooth).
    let previous = 4000;
    for (const step of steps) {
      expect(step.width * 2).toBeGreaterThanOrEqual(previous - 1);
      previous = step.width;
    }
  });
  it('goes straight to the target when already close', () => {
    expect(stepSizes({ width: 300, height: 200 }, { width: 240, height: 160 })).toEqual([{ width: 240, height: 160 }]);
  });
});

describe('createLimiter', () => {
  it('runs no more than the limit at once', async () => {
    const run = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
    };
    await Promise.all(Array.from({ length: 6 }, () => run(task)));
    expect(peak).toBe(2);
  });
});

function deps(overrides: Partial<ThumbnailDeps> = {}) {
  const data = new Map<string, Blob>();
  const store: ThumbnailStore = { get: async (key) => data.get(key), put: async (key, blob) => void data.set(key, blob) };
  const fetchBlob = vi.fn(async () => new Blob(['original']));
  const make = vi.fn(async () => new Blob(['thumb']));
  return { data, fetchBlob, make, deps: { fetchBlob, make, store, ...overrides } satisfies ThumbnailDeps };
}

describe('loadThumbnail', () => {
  it('makes a thumbnail once, stores it, and serves it from the cache afterwards', async () => {
    const t = deps();
    const first = await loadThumbnail('https://img.test/a.jpg', 'thumbnail', t.deps);
    expect(await first.text()).toBe('thumb');
    expect(t.make).toHaveBeenCalledWith(expect.anything(), THUMB_SPECS.thumbnail);
    expect(t.data.has('thumbnail|https://img.test/a.jpg')).toBe(true);
    await loadThumbnail('https://img.test/a.jpg', 'thumbnail', t.deps);
    expect(t.fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('shares one piece of work between simultaneous requests and keeps kinds apart', async () => {
    const t = deps();
    await Promise.all([loadThumbnail('https://img.test/b.jpg', 'card', t.deps), loadThumbnail('https://img.test/b.jpg', 'card', t.deps)]);
    expect(t.make).toHaveBeenCalledTimes(1);
    await loadThumbnail('https://img.test/b.jpg', 'thumbnail', t.deps);
    expect(t.make).toHaveBeenCalledTimes(2);
  });

  it('rejects when the image cannot be fetched, and still works if the cache is broken', async () => {
    const failing = deps({ fetchBlob: async () => { throw new Error('blocked'); } });
    await expect(loadThumbnail('https://img.test/c.jpg', 'thumbnail', failing.deps)).rejects.toThrow('blocked');
    const brokenStore = deps({ store: { get: async () => { throw new Error('db'); }, put: async () => { throw new Error('db'); } } });
    expect(await (await loadThumbnail('https://img.test/d.jpg', 'thumbnail', brokenStore.deps)).text()).toBe('thumb');
  });
});
