import type { FetchFn } from '../sync/shared';

export const FEED_TIMEOUT_MS = 15_000;
export const MAX_FEED_BYTES = 5 * 1024 * 1024;

export type FetchedFeed =
  | { status: 'ok'; text: string; etag?: string; lastModified?: string }
  | { status: 'not-modified' };

export interface FetchOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
  maxBytes?: number;
  /** Overrides the Accept header (e.g. to ask for an HTML page). */
  accept?: string;
  /** Validators from the previous fetch; the server may answer "not modified". */
  etag?: string;
  lastModified?: string;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Picks the text encoding from the HTTP header, a byte-order mark, or the XML declaration. */
export function detectEncoding(bytes: Uint8Array, contentType: string | null): string {
  const header = /charset=["']?([\w.:-]+)/i.exec(contentType ?? '')?.[1];
  if (header) return header;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  return /<\?xml[^>]*encoding=["']([\w.:-]+)["']/i.exec(head)?.[1] ?? 'utf-8';
}

export function decodeFeedBytes(bytes: Uint8Array, contentType: string | null): string {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(detectEncoding(bytes, contentType));
  } catch {
    decoder = new TextDecoder('utf-8'); // An encoding name the browser doesn't know.
  }
  return decoder.decode(bytes);
}

function httpProblem(status: number, url: string): string {
  const host = hostOf(url);
  if (status === 404 || status === 410) return `The feed wasn't found at ${host} (${status}). It may have moved.`;
  if (status === 401 || status === 403) return `${host} wouldn't let Tabloid read this feed (${status}).`;
  if (status === 429) return `${host} is limiting requests right now (429). It will retry later.`;
  if (status >= 500) return `${host} had a server problem (${status}). It will retry later.`;
  return `${host} answered with an unexpected status (${status}).`;
}

/** Downloads feed text. Throws an Error with a user-readable message on any problem. */
export async function fetchFeedText(url: string, options: FetchOptions = {}): Promise<FetchedFeed> {
  const { fetchFn = fetch, timeoutMs = FEED_TIMEOUT_MS, maxBytes = MAX_FEED_BYTES } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      Accept: options.accept ?? 'application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
    };
    if (options.etag) headers['If-None-Match'] = options.etag;
    if (options.lastModified) headers['If-Modified-Since'] = options.lastModified;

    let response: Response;
    try {
      response = await fetchFn(url, { headers, signal: controller.signal, credentials: 'omit', redirect: 'follow' });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`${hostOf(url)} took too long to respond.`);
      if (error instanceof TypeError) throw new Error(`Couldn't reach ${hostOf(url)}. Check your connection or the address.`);
      throw error;
    }
    if (response.status === 304) return { status: 'not-modified' };
    if (!response.ok) throw new Error(httpProblem(response.status, url));

    const declared = Number(response.headers.get('content-length'));
    if (declared > maxBytes) throw new Error(`This feed is too large (over ${Math.round(maxBytes / 1024 / 1024)} MB).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`This feed is too large (over ${Math.round(maxBytes / 1024 / 1024)} MB).`);

    return {
      status: 'ok',
      text: decodeFeedBytes(bytes, response.headers.get('content-type')),
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
    };
  } catch (error) {
    // Reading the body can also be cut short by the timeout.
    if (controller.signal.aborted && !(error instanceof Error && /took too long/.test(error.message))) {
      throw new Error(`${hostOf(url)} took too long to respond.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
