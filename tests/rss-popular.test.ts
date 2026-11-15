import { describe, expect, it } from 'vitest';
import { POPULAR_CATEGORIES, TOP_PICKS } from '../utils/rss/popular';
import { safeUrl } from '../utils/rss/text';

describe('popular feeds directory', () => {
  const all = POPULAR_CATEGORIES.flatMap((c) => c.feeds);

  it('has well-formed, unique entries in non-empty categories', () => {
    expect(POPULAR_CATEGORIES.every((c) => c.name && c.feeds.length > 0)).toBe(true);
    expect(new Set(POPULAR_CATEGORIES.map((c) => c.name)).size).toBe(POPULAR_CATEGORIES.length);
    for (const feed of all) {
      expect(feed.title).toBeTruthy();
      expect(feed.about).toBeTruthy();
      expect(safeUrl(feed.url)).toBeTruthy();
    }
    expect(new Set(all.map((f) => f.url)).size).toBe(all.length);
  });

  it('lists the requested gaming feeds', () => {
    const gaming = POPULAR_CATEGORIES.find((c) => c.name === 'Gaming')!.feeds.map((f) => f.title);
    expect(gaming).toEqual(expect.arrayContaining(['Nintendo Life', 'EventHubs']));
  });

  it('gathers featured feeds as top picks', () => {
    expect(TOP_PICKS.length).toBeGreaterThanOrEqual(5);
    expect(TOP_PICKS.every((f) => f.featured)).toBe(true);
  });
});
