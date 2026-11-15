import { makeThumbnail, type ThumbnailStore, type ThumbSpec } from '../rss/thumbnails';
import type { KeyValueStore } from '../storage/store';
import { pageKey, screenshotStoreKey } from './keys';

/** Big enough to stay sharp on a large tile, small enough to keep many on the device. */
export const SCREENSHOT_SPEC: ThumbSpec = { minSide: 480, maxSide: 1000 };
/** A page is photographed at most this often, however often it is visited. */
export const MIN_RECAPTURE_MS = 6 * 60 * 60 * 1000;
/** Time for the page to draw itself after it reports being loaded. */
export const SETTLE_MS = 1500;

export interface TabInfo {
  id?: number;
  windowId?: number;
  url?: string;
  active?: boolean;
  incognito?: boolean;
  status?: string;
}

export interface CaptureDeps {
  /** Page keys of the links that want a screenshot. */
  wanted: () => Promise<Set<string>>;
  hasAccess: () => Promise<boolean>;
  getTab: (id: number) => Promise<TabInfo | undefined>;
  /** Takes a JPEG of the visible tab of a window and returns it as a data URL. */
  capture: (target: { windowId: number; tabId: number }) => Promise<string>;
  /** Told why a page was skipped or failed (shown in development builds only). */
  log?: (message: string, detail?: unknown) => void;
  make?: (source: Blob, spec: ThumbSpec) => Promise<Blob>;
  images: ThumbnailStore;
  /** Remembers when each page was last captured. */
  meta: KeyValueStore;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
}

const eligible = (tab: TabInfo | undefined): tab is TabInfo & { id: number; windowId: number } =>
  !!tab && tab.id !== undefined && tab.windowId !== undefined && tab.active === true && tab.incognito !== true && tab.status === 'complete';

/**
 * Photographs a tab if it is showing a page one of the user's links points to. It only ever looks at the
 * tab the user is looking at, never in private windows, and only for pages they added as links.
 * Resolves to whether a screenshot was taken; never throws.
 */
export async function captureIfWanted(tab: TabInfo, deps: CaptureDeps): Promise<boolean> {
  const log = deps.log ?? (() => undefined);
  try {
    if (!eligible(tab)) return false;
    const key = pageKey(tab.url);
    if (!key) return false;
    if (!(await deps.wanted()).has(key)) return log(`${key} is not one of the screenshot links`), false;

    const metaKey = `bookmarks:shotAt:${screenshotStoreKey(key)}`;
    const now = deps.now ?? Date.now;
    const last = await deps.meta.get<number>(metaKey);
    if (typeof last === 'number' && now() - last < MIN_RECAPTURE_MS) return log(`${key} was captured recently`), false;
    if (!(await deps.hasAccess())) return log('no permission to capture all websites'), false;

    await (deps.delay ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(SETTLE_MS);
    // The user may have moved on while the page settled.
    const again = await deps.getTab(tab.id);
    if (!eligible(again) || pageKey(again.url) !== key) return log(`${key} was left before it could be captured`), false;

    const dataUrl = await deps.capture({ windowId: again.windowId, tabId: again.id });
    const blob = await (await fetch(dataUrl)).blob();
    const shot = await (deps.make ?? makeThumbnail)(blob, SCREENSHOT_SPEC);
    await deps.images.put(screenshotStoreKey(key), shot);
    await deps.meta.set(metaKey, now());
    return true;
  } catch (error) {
    log('capture failed', error);
    return false; // Pages that can't be captured (browser pages, other policies) are simply skipped.
  }
}
