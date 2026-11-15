import {
  CURRENT_STATE_VERSION,
  DEFAULT_DASHBOARD_ID,
  MAX_DASHBOARD_NAME_LENGTH,
  MAX_DASHBOARDS,
  type Dashboard,
  type StoredState,
  type WidgetInstance,
} from '../../types/layout';
import { sanitizeBackground } from '../background/settings';

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] upgrades a version-n document to version n + 1. */
const migrations: Record<number, Migration> = {
  // v2 added `preferences`.
  1: (doc) => ({ ...doc, preferences: isRecord(doc.preferences) ? doc.preferences : {} }),
  // v3 added dashboards (tabs). Everything that existed lives on the first one. The id is fixed so two
  // devices upgrading separately agree on it.
  2: (doc) => ({
    ...doc,
    dashboards: [{ id: DEFAULT_DASHBOARD_ID, name: 'Home' }],
    widgets: Array.isArray(doc.widgets) ? doc.widgets.map((w) => (isRecord(w) ? { ...w, dashboard: DEFAULT_DASHBOARD_ID } : w)) : [],
  }),
};

export function emptyState(): StoredState {
  return { version: CURRENT_STATE_VERSION, dashboards: [{ id: DEFAULT_DASHBOARD_ID, name: 'Home' }], widgets: [], preferences: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A tidy name: trimmed, one line, not too long; empty becomes the fallback. */
export function cleanDashboardName(name: unknown, fallback = 'Dashboard'): string {
  const text = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_DASHBOARD_NAME_LENGTH).trim() : '';
  return text || fallback;
}

/** Valid dashboards in order (unique ids), never empty. */
function sanitizeDashboards(raw: unknown): Dashboard[] {
  const seen = new Set<string>();
  const dashboards: Dashboard[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id) || dashboards.length >= MAX_DASHBOARDS) continue;
    seen.add(entry.id);
    const dashboard: Dashboard = { id: entry.id, name: cleanDashboardName(entry.name) };
    if (isRecord(entry.background)) dashboard.background = sanitizeBackground(entry.background);
    dashboards.push(dashboard);
  }
  return dashboards.length > 0 ? dashboards : emptyState().dashboards;
}

function sanitizeWidget(raw: unknown, fallbackDashboard: string, known: ReadonlySet<string>): WidgetInstance | null {
  if (!isRecord(raw)) return null;
  const { id, type, x, y, w, h, config, dashboard } = raw;
  if (typeof id !== 'string' || typeof type !== 'string') return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) return null;
  // A widget pointing at a dashboard that doesn't exist goes to the first one rather than vanishing.
  const home = typeof dashboard === 'string' && known.has(dashboard) ? dashboard : fallbackDashboard;
  return { id, dashboard: home, type, x, y, w, h, config: isRecord(config) ? config : {}, ...(raw.transparent === true ? { transparent: true } : {}) };
}

/**
 * Turns untrusted stored or imported data into a valid current-version state.
 * Throws when the data isn't a recognizable document or comes from a newer version.
 */
export function migrateState(raw: unknown): StoredState {
  if (!isRecord(raw)) throw new Error('Stored data is not an object');
  let version = raw.version;
  if (!isFiniteNumber(version)) throw new Error('Stored data has no version');
  if (version > CURRENT_STATE_VERSION) throw new Error(`Data version ${version} is newer than this app supports`);

  let doc: Record<string, unknown> = raw;
  while (version < CURRENT_STATE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) throw new Error(`No migration from version ${version}`);
    doc = migrate(doc);
    version += 1;
  }

  const dashboards = sanitizeDashboards(doc.dashboards);
  const known = new Set(dashboards.map((d) => d.id));
  const widgets = Array.isArray(doc.widgets)
    ? doc.widgets.map((w) => sanitizeWidget(w, dashboards[0]!.id, known)).filter((w): w is WidgetInstance => w !== null)
    : [];
  return { version: CURRENT_STATE_VERSION, dashboards, widgets, preferences: isRecord(doc.preferences) ? doc.preferences : {} };
}
