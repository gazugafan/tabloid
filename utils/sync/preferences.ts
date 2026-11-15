import type { BackgroundSettings } from '../background/settings';
import type { Preferences, StoredState } from '../../types/layout';
import { emptyState, migrateState } from '../storage/migrations';
import type { StateRepository } from '../storage/repository';
import { createConfiguredRepository } from './manager';

/**
 * Preference access for pages that don't hold the layout in memory (the options page).
 * Reads and writes go through the configured sync provider, like the new tab page's own saves.
 */
export async function loadPreferences(repository?: StateRepository): Promise<Preferences> {
  const repo = repository ?? (await createConfiguredRepository());
  const raw = await repo.load();
  return raw === undefined ? {} : migrateState(raw).preferences;
}

/** Replaces one preference section, keeping the layout and other sections as stored. */
export async function savePreference(key: string, value: unknown, repository?: StateRepository): Promise<void> {
  const repo = repository ?? (await createConfiguredRepository());
  const raw = await repo.load();
  const state: StoredState = raw === undefined ? emptyState() : migrateState(raw);
  await repo.save({ ...state, preferences: { ...state.preferences, [key]: value } });
}

/** The whole stored state, as the options page needs it (dashboards and preferences). */
export async function loadState(repository?: StateRepository): Promise<StoredState> {
  const repo = repository ?? (await createConfiguredRepository());
  const raw = await repo.load();
  return raw === undefined ? emptyState() : migrateState(raw);
}

/** Changes the stored state with `change` and saves it. */
export async function updateState(change: (state: StoredState) => StoredState, repository?: StateRepository): Promise<void> {
  const repo = repository ?? (await createConfiguredRepository());
  const raw = await repo.load();
  await repo.save(change(raw === undefined ? emptyState() : migrateState(raw)));
}

/** Sets (or with undefined, removes) one dashboard's own background settings. */
export function saveDashboardBackground(dashboardId: string, background: BackgroundSettings | undefined, repository?: StateRepository): Promise<void> {
  return updateState(
    (state) => ({
      ...state,
      dashboards: state.dashboards.map((d) => {
        if (d.id !== dashboardId) return d;
        const { background: _old, ...rest } = d;
        return background ? { ...rest, background } : rest;
      }),
    }),
    repository,
  );
}
