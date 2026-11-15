import { GRID_COLS } from '../layout';

/** What a widget would like: a width and height on the grid, and how wide it should be when it sits alone in a row. */
export interface Want {
  w: number;
  h: number;
  solo?: number;
}
export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/** Splits `widths` into `rows` runs, keeping their order, so the fullest row is as light as possible. */
function bestSplit(widths: readonly number[], rows: number): number[][] | undefined {
  let best: { cuts: number[]; worst: number } | undefined;
  const walk = (start: number, left: number, cuts: number[]) => {
    if (left === 1) {
      const all = [...cuts, widths.length];
      const worst = Math.max(...all.map((end, i) => sum(widths.slice(i === 0 ? 0 : all[i - 1], end))));
      if (!best || worst < best.worst) best = { cuts: all, worst };
      return;
    }
    for (let end = start + 1; end <= widths.length - (left - 1); end++) walk(end, left - 1, [...cuts, end]);
  };
  walk(0, rows, []);
  if (!best || best.worst > GRID_COLS) return undefined;
  return best.cuts.map((end, i) => widths.map((_, index) => index).slice(i === 0 ? 0 : best!.cuts[i - 1], end));
}

/** Groups items into rows that fill the width as evenly as possible. */
function groupIntoRows(widths: readonly number[]): number[][] {
  for (let rows = Math.max(1, Math.ceil(sum(widths) / GRID_COLS)); rows <= widths.length; rows++) {
    const split = bestSplit(widths, rows);
    if (split) return split;
  }
  return widths.map((_, i) => [i]);
}

/** Stretches the preferred widths so they add up to the full row, without anything getting too narrow. */
function stretch(widths: readonly number[]): number[] {
  const total = sum(widths);
  const exact = widths.map((w) => (w * GRID_COLS) / total);
  const result = exact.map((w) => Math.max(2, Math.floor(w)));
  let spare = GRID_COLS - sum(result);
  const byRemainder = exact.map((w, i) => ({ i, r: w - Math.floor(w) })).sort((a, b) => b.r - a.r);
  for (let k = 0; spare > 0; k = (k + 1) % byRemainder.length, spare--) result[byRemainder[k]!.i]! += 1;
  for (let i = 0; spare < 0; i = (i + 1) % result.length) if (result[i]! > 2) (result[i]!--, spare++);
  return result;
}

/** Lays one row out: all its items share the tallest height; a lone item is centered at its solo width. */
function layRow(items: readonly Want[], y: number): { spots: Spot[]; height: number } {
  const height = Math.max(...items.map((i) => i.h));
  if (items.length === 1) {
    const w = Math.min(GRID_COLS, items[0]!.solo ?? items[0]!.w);
    return { spots: [{ x: Math.floor((GRID_COLS - w) / 2), y, w, h: height }], height };
  }
  let x = 0;
  const spots = stretch(items.map((i) => i.w)).map((w): Spot => {
    const spot = { x, y, w, h: height };
    x += w;
    return spot;
  });
  return { spots, height };
}

/**
 * Arranges starter widgets in neat, full rows: the search and clock across the top, then the helpers
 * (weather, quick links, to-do, notes) in rows of equal height, then the news boxes in even rows.
 * Returns one spot per item, in the order given. `y` counts from the top of the new set.
 */
export function arrangeStarterWidgets(top: readonly Want[], helpers: readonly Want[], news: readonly Want[]): { top: Spot[]; helpers: Spot[]; news: Spot[] } {
  let y = 0;
  const place = (items: readonly Want[], groups: number[][]): Spot[] => {
    const spots: Spot[] = new Array(items.length);
    for (const group of groups) {
      const row = layRow(group.map((i) => items[i]!), y);
      group.forEach((itemIndex, k) => (spots[itemIndex] = row.spots[k]!));
      y += row.height;
    }
    return spots;
  };
  // Search and clock share one row when both are wanted.
  const topSpots = top.length > 0 ? place(top, [top.map((_, i) => i)]) : [];
  const helperSpots = helpers.length > 0 ? place(helpers, groupIntoRows(helpers.map((h) => h.w))) : [];
  // News boxes: at most three across, spread evenly over the rows.
  const rows = Math.ceil(news.length / 3);
  const groups: number[][] = [];
  let next = 0;
  for (let r = 0; r < rows; r++) {
    const count = Math.floor(news.length / rows) + (r < news.length % rows ? 1 : 0);
    groups.push(Array.from({ length: count }, () => next++));
  }
  const newsSpots = place(news, groups);
  return { top: topSpots, helpers: helperSpots, news: newsSpots };
}
