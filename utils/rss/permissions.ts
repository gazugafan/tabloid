import { browser } from 'wxt/browser';
import { hasExtensionStorage } from '../storage/store';
import { requestHostPermission } from '../sync/shared';

/** Feeds live on arbitrary sites, so reading them needs access to all sites (an optional permission). */
export const FEED_ORIGINS = ['https://*/*', 'http://*/*'];

export async function hasFeedAccess(): Promise<boolean> {
  if (!hasExtensionStorage()) return true; // Dev page: the browser applies its own rules.
  try {
    return await browser.permissions.contains({ origins: FEED_ORIGINS });
  } catch {
    return false; // Can't tell; treat as not granted so the user is offered the button.
  }
}

/**
 * Asks for access, from a user gesture. Resolves quietly if it was already granted. Firefox only allows
 * the request inside the click handler itself, so nothing may be awaited before it: that is why this
 * doesn't check for existing access first (asking again for something already granted is harmless).
 */
export function requestFeedAccess(): Promise<void> {
  return requestHostPermission(FEED_ORIGINS, 'websites');
}

/** Taking screenshots of pages needs the broadest form of access (also an optional permission). */
export const SCREENSHOT_ORIGINS = ['<all_urls>'];

export async function hasScreenshotAccess(): Promise<boolean> {
  if (!hasExtensionStorage()) return true; // Dev page: nothing to ask.
  try {
    return await browser.permissions.contains({ origins: SCREENSHOT_ORIGINS });
  } catch {
    return false;
  }
}

/** Like requestFeedAccess: call it straight from a click, with nothing awaited first. */
export function requestScreenshotAccess(): Promise<void> {
  return requestHostPermission(SCREENSHOT_ORIGINS, 'websites');
}
