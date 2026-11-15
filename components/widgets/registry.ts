import type { Component } from 'vue';
import type { IconName } from '../ui/iconPaths';
import type { WidgetConfig } from '../../types/layout';

/**
 * A button a widget adds to its frame's hover controls (next to settings and remove). Unlike move and
 * remove, these stay available while the layout is locked. A widget publishes its current list by
 * emitting `update:actions`; republish whenever labels or states change.
 */
export interface WidgetAction {
  id: string;
  /** Used as the button's accessible name and tooltip. */
  label: string;
  icon: IconName;
  disabled?: boolean;
  /** Shows the icon spinning, for work in progress. */
  busy?: boolean;
  run: () => void;
}

export interface WidgetDefinition {
  type: string;
  name: string;
  /** Default and minimum size in grid units (12 columns). */
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  defaultConfig: () => WidgetConfig;
  /**
   * Whether this widget's config may be synced through size-limited providers (e.g. browser sync).
   * Widgets that can hold a lot of data set this to false; the widget itself still syncs, its config stays on-device.
   * Defaults to true.
   */
  syncConfig?: boolean;
  /** Only offered in the Add menu of development builds (for sample and test widgets). */
  devOnly?: boolean;
  /**
   * Receives `config` and emits `update:config`. It may also emit `update:loading` (boolean) while
   * it fetches data; the frame then shows the shared loading border. It may emit `update:actions`
   * (a `WidgetAction[]`) to add buttons to the hover controls.
   */
  component: Component;
  /** Optional settings panel with the same props/emits as `component`. */
  settings?: Component;
}

// Each widget lives in its own folder with a definition.ts exporting `definition`.
// Adding a widget type means adding that folder; nothing here changes.
const modules = import.meta.glob<{ definition: WidgetDefinition }>('./*/definition.ts', { eager: true });
const definitions: WidgetDefinition[] = Object.values(modules)
  .map((module) => module.definition)
  .sort((a, b) => a.name.localeCompare(b.name));

const byType = new Map(definitions.map((d) => [d.type, d]));

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return byType.get(type);
}

/** The widgets the Add menu offers. Existing widgets of any registered type still render. */
export function listWidgetDefinitions(): readonly WidgetDefinition[] {
  return import.meta.env.DEV ? definitions : definitions.filter((d) => !d.devOnly);
}

/** Unknown types count as synced so their data isn't dropped. */
export function isConfigSynced(type: string): boolean {
  return byType.get(type)?.syncConfig ?? true;
}

export function listLocalOnlyWidgets(): readonly WidgetDefinition[] {
  return definitions.filter((d) => d.syncConfig === false);
}

/**
 * Fills in config keys added to a widget since the data was saved, so widgets can rely on every
 * default being present. Unknown types are left untouched.
 */
export function withDefaultConfig(type: string, config: WidgetConfig): WidgetConfig {
  const def = byType.get(type);
  return def ? { ...def.defaultConfig(), ...config } : config;
}
