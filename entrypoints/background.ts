import { browser } from 'wxt/browser';
import { createFeedCache } from '../utils/rss/cache';
import { isRssRequest } from '../utils/rss/messages';
import { refreshFeeds } from '../utils/rss/refresh';
import { alarmPeriodMinutes } from '../utils/rss/schedule';
import { handleRssRequest } from '../utils/rss/service';
import { createWantedFeeds } from '../utils/rss/wanted';
import { hasFeedAccess, hasScreenshotAccess } from '../utils/rss/permissions';
import { captureIfWanted, type TabInfo } from '../utils/screenshots/capture';
import { createScreenshotStore, createWantedScreenshots } from '../utils/screenshots/store';
import { createDefaultStore } from '../utils/storage/store';
import { isOwnPage, removeTabFrameRule } from '../utils/frames/rules';

const REFRESH_ALARM = 'rss-refresh';

/** Dev builds explain what the worker is doing (see its console under chrome://extensions). */
const debug = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.debug('[tabloid]', ...args);
};

/** Refreshes every feed used by an RSS widget, so the new tab is fresh the moment it opens. */
async function refreshConfiguredFeeds() {
  if (!(await hasFeedAccess())) return debug('skipping refresh: no access to websites yet');
  // The new tab page keeps this list current whenever the layout changes.
  const wanted = await createWantedFeeds().get();
  if (wanted.length === 0) return debug('skipping refresh: no feeds in the layout');
  debug(`checking ${wanted.length} feed(s)`);
  const minutes = new Map(wanted.map((w) => [w.url, w.minutes]));
  await refreshFeeds(
    wanted.map((w) => w.url),
    { cache: createFeedCache() },
    { prune: true, icons: true, ttlMs: (url) => (minutes.get(url) ?? 30) * 60_000 },
  );
}

/** Keeps the wake-up alarm matched to the shortest interval any widget asked for. */
async function syncAlarm() {
  const period = alarmPeriodMinutes(await createWantedFeeds().get());
  const existing = await browser.alarms.get(REFRESH_ALARM);
  if (existing?.periodInMinutes === period) return;
  debug(`scheduling a check every ${period} minute(s)`);
  browser.alarms.create(REFRESH_ALARM, { periodInMinutes: period });
}

/** Takes a speed-dial screenshot when the user is looking at a page one of their links points to. */
function watchForScreenshots() {
  if (!browser.tabs?.captureVisibleTab) return;
  const meta = createDefaultStore();
  const wanted = createWantedScreenshots(meta);
  const images = createScreenshotStore();
  const consider = (tab: TabInfo | undefined) => {
    if (!tab) return;
    void captureIfWanted(tab, {
      wanted: () => wanted.keys(),
      hasAccess: hasScreenshotAccess,
      getTab: (id) => browser.tabs.get(id).catch(() => undefined),
      capture: async ({ windowId, tabId }) => {
        const options = { format: 'jpeg', quality: 85 } as const;
        try {
          return await browser.tabs.captureVisibleTab(windowId, options);
        } catch (error) {
          // Firefox can also capture a given tab, which its permission checks may treat differently.
          const captureTab = (browser.tabs as unknown as { captureTab?: (id: number, o: typeof options) => Promise<string> }).captureTab;
          if (!captureTab) throw error;
          debug('captureVisibleTab failed, trying captureTab:', error);
          return await captureTab.call(browser.tabs, tabId, options);
        }
      },
      log: debug,
      images,
      meta,
    }).then((taken) => taken && debug('saved a screenshot of', tab.url));
  };
  browser.tabs.onUpdated.addListener((_id, change, tab) => change.status === 'complete' && consider(tab));
  browser.tabs.onActivated.addListener(({ tabId }) => void browser.tabs.get(tabId).then(consider, () => undefined));
}

/**
 * A Tabloid tab with a Webpages widget may strip framing headers from its frames (see utils/frames/rules.ts).
 * That must stop the moment the tab closes or shows anything other than Tabloid.
 */
function watchFrameRuleTabs() {
  const drop = (tabId: number) => void removeTabFrameRule(tabId).catch((error) => debug('could not remove a frame rule', error));
  browser.tabs.onRemoved.addListener(drop);
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url && !isOwnPage(change.url)) drop(tabId);
  });
}

export default defineBackground(() => {
  watchForScreenshots();
  watchFrameRuleTabs();

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only pages of this extension may ask for fetches.
    if (sender.id !== browser.runtime.id || !isRssRequest(message)) return false;
    void handleRssRequest(message).then(sendResponse);
    return true; // The answer arrives asynchronously.
  });

  // Alarms survive the worker being shut down; unlike timers, they wake it up.
  void syncAlarm();
  browser.runtime.onInstalled.addListener((details) => {
    void syncAlarm();
    // Greet a new user: the new tab page shows the welcome setup on its own.
    if (details.reason === 'install') void browser.tabs.create({});
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'rss:wanted' in changes) void syncAlarm();
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM) void refreshConfiguredFeeds().catch((error) => debug('refresh failed', error));
  });
});
