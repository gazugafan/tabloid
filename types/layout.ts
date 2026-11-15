export type WidgetConfig = Record<string, unknown>;

import type { BackgroundSettings } from '../utils/background/settings';

/** A placed widget. Serializable; this is what gets persisted and exported. */
export interface WidgetInstance {
  id: string;
  /** The dashboard (tab) the widget lives on. */
  dashboard: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: WidgetConfig;
  /** Draws the widget without its card (no background or border). Absent means the normal look. */
  transparent?: boolean;
}

/**
 * User preferences that travel with the layout (appearance, ...). Each feature owns one key and
 * validates it itself; unknown keys are kept so older versions don't drop newer data.
 * Device-specific settings (sync provider, credentials) never go here.
 */
export type Preferences = Record<string, unknown>;

export const CURRENT_STATE_VERSION = 3;

/** The dashboard every installation starts with, and where widgets of older versions end up. */
export const DEFAULT_DASHBOARD_ID = 'home';
export const MAX_DASHBOARDS = 20;
export const MAX_DASHBOARD_NAME_LENGTH = 40;

/** One tab of the page: its own set of widgets, and optionally its own background. */
export interface Dashboard {
  id: string;
  name: string;
  /** Replaces the general background settings while this dashboard is showing. Absent: use the general ones. */
  background?: BackgroundSettings;
}

/** The full persisted document. Bump CURRENT_STATE_VERSION and add a migration when this changes. */
export interface StoredState {
  version: number;
  /** In tab order; never empty. */
  dashboards: Dashboard[];
  widgets: WidgetInstance[];
  preferences: Preferences;
}
