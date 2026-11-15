import type { Dashboard, Preferences, StoredState, WidgetConfig, WidgetInstance } from '../../types/layout';
import type { KeyValueStore } from './store';

/** Where the layout document lives. Implementations hide how it is split across storage areas. */
export interface StateRepository {
  load(): Promise<StoredState | undefined>;
  save(state: StoredState): Promise<void>;
  /** Fires when the stored layout may have changed (including from this context). */
  subscribe(onChange: () => void): () => void;
}

const STATE_KEY = 'state';

/** The whole layout as one document in one store. Used for device-only storage. */
export function createSingleKeyRepository(store: KeyValueStore): StateRepository {
  return {
    load: () => store.get<StoredState>(STATE_KEY),
    save: (state) => store.set(STATE_KEY, state),
    subscribe: (onChange) => store.subscribe((keys) => keys.includes(STATE_KEY) && onChange()),
  };
}

export interface ConfigPolicy {
  /** False for widgets whose config can be large; their config stays on this device. */
  syncsConfig(type: string): boolean;
  defaultConfig(type: string): WidgetConfig;
  /** False for preference sections that may be large; they stay on this device. Defaults to true. */
  syncsPreference?(key: string): boolean;
}

interface SyncIndex {
  version: number;
  ids: string[];
}

const INDEX_KEY = 'index';
const PREFS_KEY = 'prefs';
const DASHBOARDS_KEY = 'dashboards';
const ITEM_PREFIX = 'w:';
const LOCAL_CONFIGS_KEY = 'localConfigs';
const LOCAL_PREFS_KEY = 'localPrefs';
/** storage.sync allows 8192 bytes per item including the key; leave headroom. */
export const MAX_SYNC_ITEM_BYTES = 8000;

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * Layout split into one small item per widget plus an index (to fit per-item quotas).
 * Configs of widgets that opt out of syncing are kept in `local` instead.
 */
export function createSplitRepository(sync: KeyValueStore, local: KeyValueStore, policy: ConfigPolicy): StateRepository {
  // What we last wrote, so unchanged items aren't rewritten (saves sync write quota).
  const written = new Map<string, string>();

  return {
    async load() {
      const index = await sync.get<SyncIndex>(INDEX_KEY);
      if (!index) return undefined;
      const items = await sync.getMany(index.ids.map((id) => ITEM_PREFIX + id));
      const localConfigs = (await local.get<Record<string, WidgetConfig>>(LOCAL_CONFIGS_KEY)) ?? {};
      const widgets: WidgetInstance[] = [];
      for (const id of index.ids) {
        const item = items[ITEM_PREFIX + id] as Partial<WidgetInstance> | undefined;
        if (!item || typeof item.type !== 'string') continue; // not fully synced yet
        const config = policy.syncsConfig(item.type)
          ? (item.config ?? {})
          : (localConfigs[id] ?? policy.defaultConfig(item.type));
        widgets.push({ ...item, config } as WidgetInstance);
        written.set(ITEM_PREFIX + id, JSON.stringify(item));
      }
      const prefs = await sync.get<Preferences>(PREFS_KEY);
      if (prefs) written.set(PREFS_KEY, JSON.stringify(prefs));
      const localPrefs = (await local.get<Preferences>(LOCAL_PREFS_KEY)) ?? {};
      const dashboards = await sync.get<Dashboard[]>(DASHBOARDS_KEY);
      if (dashboards) written.set(DASHBOARDS_KEY, JSON.stringify(dashboards));
      // An index from before dashboards existed has none; migrateState gives such data its first one.
      return { version: index.version, dashboards: dashboards ?? [], widgets, preferences: { ...(prefs ?? {}), ...localPrefs } };
    },

    async save(state) {
      const previous = await sync.get<SyncIndex>(INDEX_KEY);
      const items: Record<string, unknown> = {};
      const localConfigs: Record<string, WidgetConfig> = {};

      for (const widget of state.widgets) {
        const { config, ...geometry } = widget;
        const synced = policy.syncsConfig(widget.type);
        const item = synced ? widget : geometry;
        if (!synced) localConfigs[widget.id] = config;
        if (byteLength(item) > MAX_SYNC_ITEM_BYTES) {
          throw new Error(`A "${widget.type}" widget's settings are too large to sync (limit ${MAX_SYNC_ITEM_BYTES} bytes).`);
        }
        items[ITEM_PREFIX + widget.id] = item;
      }
      const syncedPrefs: Preferences = {};
      const localPrefs: Preferences = {};
      for (const [key, value] of Object.entries(state.preferences)) {
        (policy.syncsPreference?.(key) ?? true ? syncedPrefs : localPrefs)[key] = value;
      }
      if (byteLength(syncedPrefs) > MAX_SYNC_ITEM_BYTES) {
        throw new Error(`Your preferences are too large to sync (limit ${MAX_SYNC_ITEM_BYTES} bytes).`);
      }
      if (byteLength(state.dashboards) > MAX_SYNC_ITEM_BYTES) {
        throw new Error(`Your dashboards are too large to sync (limit ${MAX_SYNC_ITEM_BYTES} bytes).`);
      }
      items[PREFS_KEY] = syncedPrefs;
      items[DASHBOARDS_KEY] = state.dashboards;
      items[INDEX_KEY] = { version: state.version, ids: state.widgets.map((w) => w.id) } satisfies SyncIndex;

      // Local configs first, so other tabs reacting to the sync change already see them.
      await local.setMany({ [LOCAL_CONFIGS_KEY]: localConfigs, [LOCAL_PREFS_KEY]: localPrefs });

      const changed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(items)) {
        const json = JSON.stringify(value);
        if (written.get(key) !== json) changed[key] = value;
      }
      await sync.setMany(changed);
      for (const key of Object.keys(changed)) written.set(key, JSON.stringify(changed[key]));

      const current = new Set(state.widgets.map((w) => w.id));
      const stale = (previous?.ids ?? []).filter((id) => !current.has(id)).map((id) => ITEM_PREFIX + id);
      await sync.removeMany(stale);
      for (const key of stale) written.delete(key);
    },

    subscribe(onChange) {
      const stopSync = sync.subscribe((keys) => keys.some((k) => k === INDEX_KEY || k === PREFS_KEY || k === DASHBOARDS_KEY || k.startsWith(ITEM_PREFIX)) && onChange());
      const stopLocal = local.subscribe((keys) => keys.some((k) => k === LOCAL_CONFIGS_KEY || k === LOCAL_PREFS_KEY) && onChange());
      return () => {
        stopSync();
        stopLocal();
      };
    },
  };
}

/**
 * A repository backed by a remote service. Reads and writes hit a device-local cache so the page
 * works offline; `pull` and `push` reconcile the cache with the remote.
 */
export interface RemoteRepository extends StateRepository {
  /** Fetches remote changes (or pushes pending local ones). Never throws; see `getError`. */
  pull(): Promise<void>;
  /** Uploads pending local changes. Never throws; see `getError`. */
  push(): Promise<void>;
  /** The last sync problem, or null when the last attempt succeeded. */
  getError(): string | null;
}

export function isRemoteRepository(repository: StateRepository): repository is RemoteRepository {
  return 'pull' in repository;
}
