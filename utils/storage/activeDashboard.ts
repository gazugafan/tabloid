import type { StoredState } from '../../types/layout';
import { createDefaultStore, type KeyValueStore } from './store';

/** Which dashboard this device last showed. Device-local: other devices keep their own. */
export const ACTIVE_DASHBOARD_KEY = 'ui:activeDashboard';

/** The remembered dashboard if it still exists in this state, otherwise the first. */
export async function readActiveDashboardId(state: Pick<StoredState, 'dashboards'>, store: KeyValueStore = createDefaultStore()): Promise<string> {
  const remembered = await store.get<string>(ACTIVE_DASHBOARD_KEY).catch(() => undefined);
  return state.dashboards.some((d) => d.id === remembered) ? remembered! : state.dashboards[0]!.id;
}
