import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  CURRENT_STATE_VERSION,
  MAX_DASHBOARDS,
  type Dashboard,
  type Preferences,
  type StoredState,
  type WidgetConfig,
  type WidgetInstance,
} from '../types/layout';
import type { BackgroundSettings } from '../utils/background/settings';
import { ACTIVE_DASHBOARD_KEY, readActiveDashboardId } from '../utils/storage/activeDashboard';
import { createDefaultStore } from '../utils/storage/store';
import { getWidgetDefinition, withDefaultConfig } from '../components/widgets/registry';
import { nextY, packWidgets, reorderGeometry, type Geometry } from '../utils/layout';
import { cleanDashboardName, emptyState, migrateState } from '../utils/storage/migrations';
import { isRemoteRepository, type StateRepository } from '../utils/storage/repository';
import { subscribeSettings } from '../utils/sync/settings';
import { createConfiguredRepository } from '../utils/sync/manager';
import { markRead, READ_STATE_KEY, sanitizeReadState } from '../utils/rss/readState';
import { collectWantedFeeds } from '../utils/rss/service';
import { collectScreenshotLinks } from '../utils/screenshots/links';
import { createWantedScreenshots } from '../utils/screenshots/store';
import { createWantedFeeds } from '../utils/rss/wanted';
import { startRemotePolling } from '../utils/sync/polling';

const SAVE_DELAY_MS = 300;
const REMOTE_DEBOUNCE_MS = 50;

export const useLayoutStore = defineStore('layout', () => {
  /** Every widget of every dashboard. Views use `activeWidgets`. */
  const widgets = ref<WidgetInstance[]>([]);
  const dashboards = ref<Dashboard[]>([]);
  /** The dashboard being shown on this device. */
  const activeId = ref('');
  const activeDashboard = computed(() => dashboards.value.find((d) => d.id === activeId.value));
  const activeWidgets = computed(() => widgets.value.filter((w) => w.dashboard === activeId.value));
  const preferences = ref<Preferences>({});
  const loaded = ref(false);
  const loadError = ref<string | null>(null);
  const saveError = ref<string | null>(null);
  /** Problem talking to a remote provider (Dropbox). Changes stay on this device and retry. */
  const syncError = ref<string | null>(null);
  /** Bumped when widgets were replaced from outside (other tab/device), so views can rebuild. */
  const revision = ref(0);

  // Let the background worker know which feeds to keep fresh (it doesn't load the layout itself).
  const wantedFeeds = createWantedFeeds();
  watch(
    () => (loaded.value && !loadError.value ? collectWantedFeeds(widgets.value) : null),
    (feeds) => {
      if (feeds) void wantedFeeds.set(feeds).catch(() => undefined);
    },
    { deep: false },
  );

  // Likewise for pages to screenshot for Quick links widgets.
  const wantedScreenshots = createWantedScreenshots();
  watch(
    () => (loaded.value && !loadError.value ? collectScreenshotLinks(widgets.value) : null),
    (urls) => {
      if (urls) void wantedScreenshots.set(urls).catch(() => undefined);
    },
    { deep: false },
  );

  let repository: StateRepository | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let remoteTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanups: Array<() => void> = [];

  function withDefaults(list: WidgetInstance[]): WidgetInstance[] {
    return list.map((w) => ({ ...w, config: withDefaultConfig(w.type, w.config) }));
  }

  function snapshot(): StoredState {
    return {
      version: CURRENT_STATE_VERSION,
      dashboards: JSON.parse(JSON.stringify(dashboards.value)),
      widgets: JSON.parse(JSON.stringify(widgets.value)),
      preferences: JSON.parse(JSON.stringify(preferences.value)),
    };
  }

  const local = createDefaultStore();

  /** Shows another dashboard and remembers the choice for next time. */
  function setActive(id: string) {
    if (!dashboards.value.some((d) => d.id === id)) return;
    activeId.value = id;
    void local.set(ACTIVE_DASHBOARD_KEY, id).catch(() => undefined);
  }

  /** Incremented by every init so a slow, superseded one (e.g. rapid provider switches) bails out. */
  let initSequence = 0;

  /**
   * Loads from the configured provider (or the given repository, for tests) and starts listening
   * for changes from other tabs/devices.
   */
  async function init(override?: StateRepository) {
    const sequence = ++initSequence;
    dispose();
    const next = override ?? (await createConfiguredRepository());
    if (sequence !== initSequence) return;
    repository = next;
    await load();
    if (sequence !== initSequence) return;
    cleanups.push(next.subscribe(onRemoteChange));
    if (isRemoteRepository(next)) {
      cleanups.push(startRemotePolling(next, (error) => (syncError.value = error)));
    } else {
      syncError.value = null;
    }
    // Another page (options) switched sync provider: start over with the new one.
    cleanups.push(subscribeSettings(() => void init()));
  }

  function dispose() {
    clearTimeout(remoteTimer);
    while (cleanups.length) cleanups.pop()?.();
  }

  async function load() {
    try {
      const raw = await repository!.load();
      const state = raw === undefined ? emptyState() : migrateState(raw);
      widgets.value = withDefaults(state.widgets);
      dashboards.value = state.dashboards;
      preferences.value = state.preferences;
      activeId.value = await readActiveDashboardId({ dashboards: dashboards.value }, local);
      loadError.value = null;
    } catch (error) {
      // Don't overwrite data we couldn't read; start empty in memory and surface the problem.
      loadError.value = error instanceof Error ? error.message : String(error);
      widgets.value = [];
      dashboards.value = emptyState().dashboards;
      activeId.value = dashboards.value[0]!.id;
      preferences.value = {};
    }
    revision.value++;
    loaded.value = true;
  }

  function onRemoteChange() {
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(() => void applyRemote(), REMOTE_DEBOUNCE_MS);
  }

  async function applyRemote() {
    // Unsaved local edits win (last write wins); they will be written shortly.
    if (saveTimer !== undefined || !loaded.value || loadError.value) return;
    try {
      const raw = await repository!.load();
      if (raw === undefined) return;
      const next = migrateState(raw);
      next.widgets = withDefaults(next.widgets);
      const unchanged =
        JSON.stringify(next.widgets) === JSON.stringify(widgets.value) &&
        JSON.stringify(next.dashboards) === JSON.stringify(dashboards.value) &&
        JSON.stringify(next.preferences) === JSON.stringify(preferences.value);
      if (saveTimer !== undefined || unchanged) return;
      widgets.value = next.widgets;
      dashboards.value = next.dashboards;
      preferences.value = next.preferences;
      // The dashboard being shown may have been deleted elsewhere.
      if (!dashboards.value.some((d) => d.id === activeId.value)) activeId.value = dashboards.value[0]!.id;
      revision.value++;
    } catch {
      // A half-written or newer-version remote state: keep what we have.
    }
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!loaded.value || loadError.value) return;
    try {
      const repo = repository!;
      await repo.save(snapshot());
      saveError.value = null;
      if (isRemoteRepository(repo)) syncError.value = repo.getError();
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : String(error);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
  }

  function addWidget(type: string): WidgetInstance | undefined {
    const def = getWidgetDefinition(type);
    if (!def) return undefined;
    const widget: WidgetInstance = {
      id: crypto.randomUUID(),
      dashboard: activeId.value,
      type,
      x: 0,
      y: nextY(activeWidgets.value),
      w: def.defaultSize.w,
      h: def.defaultSize.h,
      config: def.defaultConfig(),
    };
    widgets.value.push(widget);
    scheduleSave();
    return widget;
  }

  /** Adds several widgets at once to the bottom of the active dashboard, laid out in rows, with one save. */
  /**
   * Adds several widgets at once. With `x` and `y` they keep that arrangement (counted from below the
   * widgets already there); without, they are packed in rows.
   */
  function addWidgets(specs: ReadonlyArray<{ type: string; w: number; h: number; x?: number; y?: number; transparent?: boolean; config: WidgetConfig }>): WidgetInstance[] {
    const known = specs.filter((spec) => getWidgetDefinition(spec.type));
    const startY = nextY(activeWidgets.value);
    const packed = packWidgets(known, startY);
    const added = known.map((spec, i): WidgetInstance => ({
      id: crypto.randomUUID(),
      dashboard: activeId.value,
      type: spec.type,
      x: spec.x ?? packed[i]!.x,
      y: spec.y === undefined ? packed[i]!.y : startY + spec.y,
      w: spec.w,
      h: spec.h,
      ...(spec.transparent ? { transparent: true } : {}),
      config: withDefaultConfig(spec.type, spec.config),
    }));
    if (added.length) {
      widgets.value.push(...added);
      scheduleSave();
    }
    return added;
  }

  // ---- Dashboards (tabs) ----

  /** Adds a dashboard after the last one and switches to it. Undefined when the limit is reached. */
  function addDashboard(name?: string): Dashboard | undefined {
    if (dashboards.value.length >= MAX_DASHBOARDS) return undefined;
    const dashboard: Dashboard = { id: crypto.randomUUID(), name: cleanDashboardName(name, `Dashboard ${dashboards.value.length + 1}`) };
    dashboards.value.push(dashboard);
    setActive(dashboard.id);
    scheduleSave();
    return dashboard;
  }

  function renameDashboard(id: string, name: string) {
    const dashboard = dashboards.value.find((d) => d.id === id);
    if (!dashboard) return;
    const clean = cleanDashboardName(name, dashboard.name);
    if (clean === dashboard.name) return;
    dashboard.name = clean;
    scheduleSave();
  }

  /** Moves a dashboard to a new position in the tab order. */
  function moveDashboard(id: string, toIndex: number) {
    const from = dashboards.value.findIndex((d) => d.id === id);
    const to = Math.max(0, Math.min(dashboards.value.length - 1, toIndex));
    if (from < 0 || from === to) return;
    const [dashboard] = dashboards.value.splice(from, 1);
    dashboards.value.splice(to, 0, dashboard!);
    scheduleSave();
  }

  /** Sets (or with undefined, clears) the background this dashboard uses instead of the general one. */
  function setDashboardBackground(id: string, background: BackgroundSettings | undefined) {
    const dashboard = dashboards.value.find((d) => d.id === id);
    if (!dashboard) return;
    if (background) dashboard.background = background;
    else delete dashboard.background;
    scheduleSave();
  }

  /**
   * Deletes a dashboard together with its widgets (the last one can't be deleted). Returns what is
   * needed to bring it back.
   */
  function removeDashboard(id: string): { dashboard: Dashboard; index: number; widgets: WidgetInstance[] } | undefined {
    const index = dashboards.value.findIndex((d) => d.id === id);
    if (index < 0 || dashboards.value.length <= 1) return undefined;
    const [dashboard] = dashboards.value.splice(index, 1);
    const removed = widgets.value.filter((w) => w.dashboard === id);
    widgets.value = widgets.value.filter((w) => w.dashboard !== id);
    if (activeId.value === id) setActive(dashboards.value[Math.min(index, dashboards.value.length - 1)]!.id);
    scheduleSave();
    return { dashboard: dashboard!, index, widgets: removed };
  }

  function restoreDashboard(removed: { dashboard: Dashboard; index: number; widgets: WidgetInstance[] }) {
    if (dashboards.value.some((d) => d.id === removed.dashboard.id)) return;
    dashboards.value.splice(Math.min(removed.index, dashboards.value.length), 0, removed.dashboard);
    widgets.value.push(...removed.widgets);
    setActive(removed.dashboard.id);
    scheduleSave();
  }

  /** Records articles as read (device-local when the sync provider has little room). */
  function markItemsRead(ids: readonly string[]) {
    const current = sanitizeReadState(preferences.value[READ_STATE_KEY]);
    const next = markRead(current, ids);
    if (next !== current) setPreference(READ_STATE_KEY, next);
  }

  /** Replaces one preference section (e.g. 'appearance'). */
  function setPreference(key: string, value: unknown) {
    preferences.value = { ...preferences.value, [key]: value };
    scheduleSave();
  }

  /** Removes a widget and returns it with its position, so the caller can offer to restore it. */
  function removeWidget(id: string): { widget: WidgetInstance; index: number } | undefined {
    const index = widgets.value.findIndex((w) => w.id === id);
    if (index < 0) return undefined;
    const [widget] = widgets.value.splice(index, 1);
    scheduleSave();
    return widget ? { widget, index } : undefined;
  }

  /** Puts back a widget removed with `removeWidget`, in its old place in the order. */
  function restoreWidget(widget: WidgetInstance, index: number) {
    if (widgets.value.some((w) => w.id === widget.id)) return;
    widgets.value.splice(Math.min(index, widgets.value.length), 0, widget);
    scheduleSave();
  }

  /** Turns a widget's card (background and border) off or on. */
  function setTransparent(id: string, transparent: boolean) {
    const widget = widgets.value.find((w) => w.id === id);
    if (!widget || !!widget.transparent === transparent) return;
    if (transparent) widget.transparent = true;
    else delete widget.transparent;
    scheduleSave();
  }

  function updateConfig(id: string, config: WidgetConfig) {
    const widget = widgets.value.find((w) => w.id === id);
    if (!widget) return;
    widget.config = config;
    scheduleSave();
  }

  /** Called by the grid after drag/resize with the new positions. */
  function updateGeometry(items: readonly Geometry[]) {
    let changed = false;
    for (const item of items) {
      const widget = widgets.value.find((w) => w.id === item.id);
      if (!widget) continue;
      if (widget.x !== item.x || widget.y !== item.y || widget.w !== item.w || widget.h !== item.h) {
        Object.assign(widget, { x: item.x, y: item.y, w: item.w, h: item.h });
        changed = true;
      }
    }
    if (changed) scheduleSave();
  }

  /** Heights only, for the one-column layout where width can't change. */
  function setHeights(items: ReadonlyArray<{ id: string; h: number }>) {
    let changed = false;
    for (const item of items) {
      const widget = widgets.value.find((w) => w.id === item.id);
      if (widget && Number.isFinite(item.h) && item.h >= 1 && widget.h !== item.h) {
        widget.h = item.h;
        changed = true;
      }
    }
    if (changed) scheduleSave();
  }

  /** Applies a single-column drag-and-drop order to the shared layout. */
  function reorder(orderedIds: readonly string[]) {
    const geometry = reorderGeometry(activeWidgets.value, orderedIds);
    if (!geometry) return;
    updateGeometry(geometry);
    revision.value++;
  }

  function exportJson(): string {
    return JSON.stringify(snapshot(), null, 2);
  }

  /** Throws if the JSON is invalid; leaves current state untouched in that case. */
  async function importJson(json: string) {
    const state = migrateState(JSON.parse(json));
    widgets.value = withDefaults(state.widgets);
    dashboards.value = state.dashboards;
    if (!dashboards.value.some((d) => d.id === activeId.value)) activeId.value = dashboards.value[0]!.id;
    preferences.value = state.preferences;
    loadError.value = null;
    loaded.value = true;
    revision.value++;
    await saveNow();
  }

  return {
    widgets, dashboards, activeId, activeDashboard, activeWidgets, preferences, loaded, loadError, saveError, syncError, revision,
    setActive, addDashboard, renameDashboard, moveDashboard, setDashboardBackground, removeDashboard, restoreDashboard,
    setPreference, markItemsRead, init, dispose, load, saveNow, addWidget, addWidgets, removeWidget, restoreWidget, updateConfig, setTransparent, updateGeometry, setHeights, reorder,
    exportJson, importJson,
  };
});
