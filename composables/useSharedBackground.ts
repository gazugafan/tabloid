import { ref } from 'vue';
import type { Dashboard } from '../types/layout';
import { BACKGROUND_KEY } from './useBackground';
import { sanitizeBackground, type BackgroundSettings } from '../utils/background/settings';

/**
 * The background settings as the settings page currently has them, shared by its sections so the
 * Appearance preview follows edits made in the Background section without waiting for a reload.
 */
const general = ref<BackgroundSettings | null>(null);
const overrides = ref<Record<string, BackgroundSettings | undefined>>({});
/** Bumped when uploaded images are added or removed. */
export const uploadsVersion = ref(0);

/** Fills in the stored settings once, whichever section loads first. */
export function seedSharedBackground(state: { dashboards: Dashboard[]; preferences: Record<string, unknown> }) {
  if (general.value) return;
  general.value = sanitizeBackground(state.preferences[BACKGROUND_KEY]);
  overrides.value = Object.fromEntries(state.dashboards.filter((d) => d.background).map((d) => [d.id, sanitizeBackground(d.background)]));
}

/** `scope` '' is the general settings; otherwise a dashboard's own (undefined removes them). */
export function publishBackground(scope: string, settings: BackgroundSettings | undefined) {
  if (scope === '') {
    if (settings) general.value = settings;
  } else {
    overrides.value = { ...overrides.value, [scope]: settings };
  }
}

/** What a dashboard shows: its own settings, or the general ones. */
export const effectiveBackground = (dashboardId: string | undefined) => (dashboardId ? overrides.value[dashboardId] : undefined) ?? general.value;
