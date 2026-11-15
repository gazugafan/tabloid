import type { WidgetInstance } from '../types/layout';

export const GRID_COLS = 12;
export const ROW_HEIGHT = 40;
export const GRID_MARGIN = 16;

/** Reading order used when the grid collapses to a single column: top to bottom, then left to right. */
export function sortForStack(widgets: readonly WidgetInstance[]): WidgetInstance[] {
  return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Pixel height of a widget spanning `rows` grid rows. */
export function rowsToPx(rows: number): number {
  return rows * ROW_HEIGHT + (rows - 1) * GRID_MARGIN;
}

/** The first free y below every existing widget; new widgets are appended to the bottom. */
export function nextY(widgets: readonly WidgetInstance[]): number {
  return widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
}

export type Geometry = Pick<WidgetInstance, 'id' | 'x' | 'y' | 'w' | 'h'>;

/**
 * Applies a new single-column order to the shared layout. Widgets take over the positions
 * ("slots") of the previous order, keeping their own sizes, so desktop and mobile stay in step.
 * Returns null when the order is unchanged or isn't a permutation of the widgets.
 */
export function reorderGeometry(widgets: readonly WidgetInstance[], orderedIds: readonly string[]): Geometry[] | null {
  const current = sortForStack(widgets);
  if (orderedIds.length !== current.length) return null;
  const byId = new Map(current.map((w) => [w.id, w]));
  if (orderedIds.some((id) => !byId.has(id)) || new Set(orderedIds).size !== orderedIds.length) return null;
  if (orderedIds.every((id, i) => current[i]?.id === id)) return null;

  return orderedIds.map((id, i) => {
    const widget = byId.get(id)!;
    const slot = current[i]!;
    return { id, x: slot.x, y: slot.y, w: widget.w, h: widget.h };
  });
}

/**
 * Places widgets in rows from left to right below `startY`, starting a new row when one is full.
 * The grid then pulls each widget up into any free space above it.
 */
export function packWidgets(sizes: ReadonlyArray<{ w: number; h: number }>, startY: number, cols: number = GRID_COLS): Array<{ x: number; y: number }> {
  const spots: Array<{ x: number; y: number }> = [];
  let x = 0;
  let y = startY;
  let rowHeight = 0;
  for (const { w, h } of sizes) {
    if (x > 0 && x + w > cols) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    spots.push({ x, y });
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  return spots;
}
