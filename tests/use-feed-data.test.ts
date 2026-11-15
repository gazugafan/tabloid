import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { useFeedData } from '../composables/useFeedData';
import { createFeedCache } from '../utils/rss/cache';
import type { FeedClient } from '../utils/rss/client';
import type { CachedFeed } from '../utils/rss/types';
import { memoryStore } from './helpers';

const cached = (url: string): CachedFeed => ({ url, title: url, fetchedAt: 1, items: [] });

async function setup(options: { refreshOnOpen: boolean; cachedUrls: string[] }) {
  const cache = createFeedCache(memoryStore());
  for (const url of options.cachedUrls) await cache.put(cached(url));
  const refresh = vi.fn(async (_urls: readonly string[], _options?: { force?: boolean; ttlMs?: number }) => undefined);
  const client: FeedClient = { refresh };
  const urls = ref(['https://a.test/f', 'https://b.test/f']);
  mount(defineComponent({ setup: () => useFeedData(urls, { cache, client, refreshOnOpen: ref(options.refreshOnOpen) }), template: '<div />' }));
  await vi.waitFor(() => expect(refresh.mock.calls.length + 1).toBeGreaterThan(0));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { refresh, urls };
}

describe('useFeedData refresh on open', () => {
  beforeEach(() => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(true as never);
  });

  it('refreshes every feed when opening the page, by default', async () => {
    const { refresh } = await setup({ refreshOnOpen: true, cachedUrls: ['https://a.test/f', 'https://b.test/f'] });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0]![0]).toEqual(['https://a.test/f', 'https://b.test/f']);
  });

  it('checks on open even if the refresh interval has not passed, but not more than every two minutes', async () => {
    const { refresh } = await setup({ refreshOnOpen: true, cachedUrls: ['https://a.test/f', 'https://b.test/f'] });
    expect(refresh.mock.calls[0]![1]).toMatchObject({ force: false, ttlMs: 2 * 60_000 });
  });

  it('does not refresh cached feeds on open when turned off', async () => {
    const { refresh } = await setup({ refreshOnOpen: false, cachedUrls: ['https://a.test/f', 'https://b.test/f'] });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('still fetches feeds that have nothing cached, even when turned off', async () => {
    const { refresh } = await setup({ refreshOnOpen: false, cachedUrls: ['https://a.test/f'] });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0]![0]).toEqual(['https://b.test/f']);
  });
});
