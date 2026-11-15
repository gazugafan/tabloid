/**
 * Identifies a page for screenshots: host (without "www.") plus path, ignoring the scheme, query,
 * fragment and a trailing slash. Only web pages without a login in the address have a key.
 */
export function pageKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return undefined;
    return `${u.host.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return undefined;
  }
}

/** Where a page's screenshot is kept in the device-local image store. */
export const screenshotStoreKey = (key: string) => `shot|${key}`;
