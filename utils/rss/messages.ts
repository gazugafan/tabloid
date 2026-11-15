/** Requests the new tab page sends to the background worker. */
export type RssRequest = {
  type: 'rss:refresh';
  urls: string[];
  force?: boolean;
  /** How long cached feeds count as fresh, in ms. */
  ttlMs?: number;
};

export type RssResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export function isRssRequest(message: unknown): message is RssRequest {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as Record<string, unknown>;
  return (
    m.type === 'rss:refresh' &&
    Array.isArray(m.urls) &&
    m.urls.every((u) => typeof u === 'string') &&
    m.urls.length <= 200 &&
    (m.ttlMs === undefined || (typeof m.ttlMs === 'number' && m.ttlMs >= 60_000 && m.ttlMs <= 7 * 24 * 3600_000))
  );
}
