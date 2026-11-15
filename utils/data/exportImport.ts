import type { Preferences, StoredState } from '../../types/layout';
import { migrateState } from '../storage/migrations';
import { READ_STATE_KEY } from '../rss/readState';

/** Marks files as ours, so picking the wrong JSON file gives a clear message. */
export const EXPORT_FORMAT = 'tabloid-setup';
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Preference sections that belong to this device or are too bulky to carry around. */
const NOT_EXPORTED: readonly string[] = [READ_STATE_KEY];

/**
 * The setup as a JSON file: dashboards, widgets with their settings and layout, plus appearance and background
 * settings. Left out: credentials and sync settings (they never leave the device), cached articles,
 * read history, and uploaded background images.
 */
export function buildSetupExport(state: StoredState, now: Date = new Date()): string {
  const preferences: Preferences = Object.fromEntries(Object.entries(state.preferences).filter(([key]) => !NOT_EXPORTED.includes(key)));
  return JSON.stringify({ format: EXPORT_FORMAT, exportedAt: now.toISOString(), version: state.version, dashboards: state.dashboards, widgets: state.widgets, preferences }, null, 2);
}

/** Checks and upgrades an exported file. Throws a readable error for anything that isn't a Tabloid setup. */
export function parseSetupImport(text: string): StoredState {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('That file is too large to be a Tabloid setup.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== EXPORT_FORMAT) {
    throw new Error("That doesn't look like a Tabloid setup file.");
  }
  try {
    return migrateState(raw);
  } catch (error) {
    throw new Error(error instanceof Error ? `${error.message}.` : 'That setup file could not be read.');
  }
}

/**
 * What the layout looks like after importing: everything comes from the file, except things that are
 * kept on this device (read history stays as it is).
 */
export function replaceWithImport(current: StoredState, imported: StoredState): StoredState {
  const kept = Object.fromEntries(NOT_EXPORTED.filter((key) => key in current.preferences).map((key) => [key, current.preferences[key]]));
  return { ...imported, preferences: { ...imported.preferences, ...kept } };
}
