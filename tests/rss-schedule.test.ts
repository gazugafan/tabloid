import { describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { FEED_ORIGINS, requestFeedAccess } from '../utils/rss/permissions';
import { DEFAULT_RSS_CONFIG, sanitizeRssConfig } from '../utils/rss/config';
import { alarmPeriodMinutes } from '../utils/rss/schedule';

describe('alarmPeriodMinutes', () => {
  const feed = (minutes: number) => ({ url: `https://a.test/${minutes}`, minutes });

  it('follows the shortest interval, but never wakes less often than every 15 minutes', () => {
    expect(alarmPeriodMinutes([])).toBe(15);
    expect(alarmPeriodMinutes([feed(360), feed(720)])).toBe(15);
    expect(alarmPeriodMinutes([feed(60), feed(30)])).toBe(15);
    expect(alarmPeriodMinutes([feed(60), feed(5)])).toBe(5);
    expect(alarmPeriodMinutes([feed(1), feed(30)])).toBe(1);
  });

  it('never goes below one minute', () => {
    expect(alarmPeriodMinutes([feed(0)])).toBe(1);
  });
});

describe('requestFeedAccess', () => {
  it('asks the browser immediately, before anything is awaited (Firefox needs this inside the click)', () => {
    const request = vi.spyOn(browser.permissions, 'request').mockResolvedValue(true as never);
    const contains = vi.spyOn(browser.permissions, 'contains').mockResolvedValue(true as never);
    void requestFeedAccess();
    expect(request).toHaveBeenCalledTimes(1); // No `await` ran yet.
    expect(request).toHaveBeenCalledWith({ origins: FEED_ORIGINS });
    expect(contains).not.toHaveBeenCalled();
  });

  it('explains a declined request', async () => {
    vi.spyOn(browser.permissions, 'request').mockResolvedValue(false as never);
    await expect(requestFeedAccess()).rejects.toThrow(/declined/);
  });
});

describe('feed marker default', () => {
  it('uses the site icon unless told otherwise', () => {
    expect(DEFAULT_RSS_CONFIG.feedMarker).toBe('icon');
    expect(sanitizeRssConfig({}).feedMarker).toBe('icon');
    expect(sanitizeRssConfig({ feedMarker: 'dot' }).feedMarker).toBe('dot');
  });
});
