/**
 * Moving and resizing widgets without the grid library's pointer handling: by keyboard, and from the lower-left
 * resize handle (the library only resizes from the right). Pure functions over grid entries, so they're easy to
 * test. They follow the grid's own rules: widgets never overlap, and everything floats up as far as it can.
 */

export interface ArrangeItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

const overlaps = (a: ArrangeItem, b: ArrangeItem) =>
  a !== b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const sharesColumns = (a: ArrangeItem, b: ArrangeItem) => a.x < b.x + b.w && b.x < a.x + a.w;
const byPosition = (a: ArrangeItem, b: ArrangeItem) => a.y - b.y || a.x - b.x;

/**
 * Floats every widget up as far as it goes without overlapping, top to bottom. `pinned` is placed first and stays
 * where it is, so the widgets it now covers make way for it (they move below it).
 */
export function compact(items: readonly ArrangeItem[], pinned?: string): ArrangeItem[] {
  const placed: ArrangeItem[] = [];
  const fixed = items.find((item) => item.i === pinned);
  if (fixed) placed.push({ ...fixed });
  for (const original of [...items].sort(byPosition)) {
    if (original.i === pinned) continue;
    const item = { ...original };
    while (item.y > 0 && !placed.some((other) => overlaps({ ...item, y: item.y - 1 }, other))) item.y--;
    let blocker: ArrangeItem | undefined;
    while ((blocker = placed.find((other) => overlaps(item, other)))) item.y = blocker.y + blocker.h;
    placed.push(item);
  }
  // A second, ordinary pass closes any gap the pinned widget left above itself.
  const result = fixed ? compact(placed) : placed;
  const order = new Map(items.map((item, index) => [item.i, index]));
  return result.sort((a, b) => order.get(a.i)! - order.get(b.i)!);
}

/**
 * Moves a widget one step. Left and right shift it a column. Up and down swap it with the nearest widget above or
 * below it (in a packed grid, a single row down would just float back up).
 */
export function moveWidget(items: readonly ArrangeItem[], id: string, direction: Direction, cols: number): ArrangeItem[] {
  const item = items.find((entry) => entry.i === id);
  if (!item) return [...items];
  const others = items.filter((entry) => entry !== item);
  let target: Partial<ArrangeItem>;
  switch (direction) {
    case 'left':
    case 'right': {
      const x = Math.min(Math.max(item.x + (direction === 'left' ? -1 : 1), 0), cols - item.w);
      if (x === item.x) return [...items];
      const blocker = others.find((other) => overlaps({ ...item, x }, other));
      if (!blocker) {
        target = { x };
        break;
      }
      // A widget right beside it in the same rows: trade places with it, rather than pushing it (and whatever is
      // under it) down the page.
      const swapped = direction === 'left' ? { item: blocker.x, other: blocker.x + item.w } : { item: item.x + blocker.w, other: item.x };
      const moved = items.map((entry) =>
        entry === item ? { ...entry, x: swapped.item } : entry === blocker ? { ...entry, x: swapped.other } : entry,
      );
      return compact(moved, id);
    }
    case 'up': {
      const above = others.filter((other) => sharesColumns(item, other) && other.y + other.h <= item.y);
      const nearest = above.sort((a, b) => b.y + b.h - (a.y + a.h) || a.y - b.y)[0];
      if (!nearest) return [...items];
      target = { y: nearest.y };
      break;
    }
    case 'down': {
      const below = others.filter((other) => sharesColumns(item, other) && other.y >= item.y + item.h);
      const nearest = below.sort((a, b) => a.y - b.y)[0];
      if (!nearest) return [...items];
      // Put it just below that widget; the compaction then lifts the widget into the space it left.
      return compact(items.map((entry) => (entry === item ? { ...entry, y: nearest.y + nearest.h } : entry)));
    }
  }
  return compact(items.map((entry) => (entry === item ? { ...entry, ...target } : entry)), id);
}

/** Grows or shrinks a widget by one column or row from its lower-right corner, within its minimum size and the grid. */
export function resizeWidget(items: readonly ArrangeItem[], id: string, direction: Direction, cols: number): ArrangeItem[] {
  const item = items.find((entry) => entry.i === id);
  if (!item) return [...items];
  const w = direction === 'left' ? item.w - 1 : direction === 'right' ? item.w + 1 : item.w;
  const h = direction === 'up' ? item.h - 1 : direction === 'down' ? item.h + 1 : item.h;
  return setSize(items, id, { x: item.x, w, h }, cols);
}

/**
 * Resizing from the lower-left corner: dragging `columns` to the right (negative is left) and `rows` down from where
 * the drag started. The right edge stays put. `start` is the widget as it was when the drag started.
 */
export function resizeFromLeft(items: readonly ArrangeItem[], start: ArrangeItem, columns: number, rows: number, cols: number): ArrangeItem[] {
  const right = start.x + start.w;
  const x = Math.min(Math.max(start.x + columns, 0), right - start.minW);
  return setSize(items, start.i, { x, w: right - x, h: start.h + rows }, cols);
}

function setSize(items: readonly ArrangeItem[], id: string, size: { x: number; w: number; h: number }, cols: number): ArrangeItem[] {
  const item = items.find((entry) => entry.i === id);
  if (!item) return [...items];
  // Growing sideways stops at the next widget in the same rows (pushing it below would leave a hole); growing
  // down pushes the widgets below further down, as the grid always does.
  const beside = items.filter((other) => other !== item && other.y < item.y + item.h && item.y < other.y + other.h);
  const leftLimit = Math.max(0, ...beside.filter((o) => o.x + o.w <= item.x).map((o) => o.x + o.w));
  const rightLimit = Math.min(cols, ...beside.filter((o) => o.x >= item.x + item.w).map((o) => o.x));
  const right = Math.min(Math.max(size.x + size.w, item.x + Math.min(item.minW, cols)), Math.max(rightLimit, item.x + item.w));
  const x = Math.min(Math.max(size.x, Math.min(leftLimit, item.x)), right - Math.min(item.minW, cols));
  const w = right - x;
  const h = Math.max(size.h, item.minH, 1);
  if (x === item.x && w === item.w && h === item.h) return [...items];
  return compact(items.map((entry) => (entry === item ? { ...entry, x, w, h } : entry)), id);
}

/** Whole grid steps for a pointer movement of `px`, where one step is a column or row plus the gap between them. */
export const gridSteps = (px: number, step: number) => (step > 0 ? Math.round(px / step) : 0);
