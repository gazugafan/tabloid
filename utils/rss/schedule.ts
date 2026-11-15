import type { WantedFeed } from './wanted';

/** The most often the background worker wakes, however long the widgets' intervals are. */
export const MAX_ALARM_MINUTES = 15;
/** Browsers don't deliver alarms more often than about once a minute. */
export const MIN_ALARM_MINUTES = 1;

/**
 * How often the background worker should wake up to check for stale feeds: often enough for the
 * shortest interval any widget asked for, but at most every 15 minutes. (Waking is cheap; feeds that
 * aren't stale yet are skipped.)
 */
export function alarmPeriodMinutes(wanted: readonly WantedFeed[]): number {
  const shortest = wanted.length > 0 ? Math.min(...wanted.map((w) => w.minutes)) : MAX_ALARM_MINUTES;
  return Math.max(MIN_ALARM_MINUTES, Math.min(MAX_ALARM_MINUTES, shortest));
}
