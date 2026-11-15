import { browser } from 'wxt/browser';
import { hasExtensionStorage } from '../storage/store';
import type { RssRequest, RssResponse } from './messages';
import { handleRssRequest } from './service';

/**
 * How the new tab page asks for feed work. Inside the installed extension the background worker does
 * the fetching; if it can't be reached (or on the dev page) the page does the same work itself.
 */
export interface FeedClient {
  refresh(urls: readonly string[], options?: { force?: boolean; ttlMs?: number }): Promise<void>;
}

async function send(request: RssRequest): Promise<RssResponse> {
  if (hasExtensionStorage() && browser.runtime?.id) {
    try {
      const response = (await browser.runtime.sendMessage(request)) as RssResponse | undefined;
      if (response && typeof response.ok === 'boolean') return response;
    } catch {
      // The worker couldn't be reached; fall through and do the work here.
    }
  }
  return handleRssRequest(request);
}

export function createFeedClient(): FeedClient {
  return {
    async refresh(urls, options = {}) {
      const response = await send({ type: 'rss:refresh', urls: [...urls], force: options.force, ttlMs: options.ttlMs });
      if (!response.ok) throw new Error(response.error);
    },
  };
}
