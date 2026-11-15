import { describe, expect, it } from 'vitest';
import { compact, gridSteps, moveWidget, resizeFromLeft, resizeWidget, type ArrangeItem } from '../utils/arrange';

const item = (i: string, x: number, y: number, w: number, h: number, minW = 1, minH = 1): ArrangeItem => ({ i, x, y, w, h, minW, minH });
const at = (items: ArrangeItem[], id: string) => {
  const { x, y, w, h } = items.find((entry) => entry.i === id)!;
  return { x, y, w, h };
};
const noOverlaps = (items: ArrangeItem[]) =>
  items.every((a) => items.every((b) => a === b || a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));

describe('compact', () => {
  it('floats widgets up and keeps the input order', () => {
    const result = compact([item('b', 0, 9, 4, 2), item('a', 0, 3, 4, 3)]);
    expect(result.map((entry) => entry.i)).toEqual(['b', 'a']);
    expect(at(result, 'a').y).toBe(0);
    expect(at(result, 'b').y).toBe(3);
  });

  it('moves widgets out of the way of a pinned one', () => {
    const result = compact([item('a', 0, 0, 4, 3), item('b', 2, 1, 4, 2)], 'b');
    expect(at(result, 'b')).toEqual({ x: 2, y: 0, w: 4, h: 2 });
    expect(at(result, 'a').y).toBe(2);
    expect(noOverlaps(result)).toBe(true);
  });
});

describe('moveWidget', () => {
  const layout = [item('a', 0, 0, 4, 3), item('b', 0, 3, 4, 5), item('c', 4, 0, 4, 2)];

  it('shifts a column left or right, staying inside the grid', () => {
    expect(at(moveWidget(layout, 'c', 'right', 12), 'c').x).toBe(5);
    expect(at(moveWidget([item('d', 8, 0, 4, 2)], 'd', 'right', 12), 'd').x).toBe(8);
    expect(at(moveWidget(layout, 'a', 'left', 12), 'a').x).toBe(0);
  });

  it('trades places with a widget right beside it', () => {
    const result = moveWidget(layout, 'c', 'left', 12);
    expect(at(result, 'c')).toEqual({ x: 0, y: 0, w: 4, h: 2 });
    expect(at(result, 'a')).toEqual({ x: 4, y: 0, w: 4, h: 3 });
    expect(noOverlaps(result)).toBe(true);
    const back = moveWidget(result, 'c', 'right', 12);
    expect(at(back, 'c').x).toBe(4);
    expect(at(back, 'a').x).toBe(0);
  });

  it('swaps with the widget below or above', () => {
    const down = moveWidget(layout, 'a', 'down', 12);
    expect(at(down, 'b').y).toBe(0);
    expect(at(down, 'a').y).toBe(5);
    const up = moveWidget(down, 'a', 'up', 12);
    expect(at(up, 'a').y).toBe(0);
    expect(at(up, 'b').y).toBe(3);
  });

  it('does nothing at the top or bottom', () => {
    expect(moveWidget(layout, 'a', 'up', 12)).toEqual(layout);
    expect(moveWidget(layout, 'b', 'down', 12)).toEqual(layout);
  });

  it('works in the one-column phone layout', () => {
    const stack = [item('a', 0, 0, 1, 3), item('b', 0, 3, 1, 4)];
    const result = moveWidget(stack, 'b', 'up', 1);
    expect(at(result, 'b').y).toBe(0);
    expect(at(result, 'a').y).toBe(4);
  });
});

describe('resizeWidget', () => {
  const layout = [item('a', 0, 0, 4, 3, 2, 2), item('b', 4, 0, 4, 3)];

  it('grows and shrinks by one step, within the minimum size and the grid', () => {
    expect(at(resizeWidget(layout, 'a', 'down', 12), 'a').h).toBe(4);
    expect(at(resizeWidget(layout, 'a', 'up', 12), 'a').h).toBe(2);
    expect(at(resizeWidget([item('a', 0, 0, 2, 2, 2, 2)], 'a', 'left', 12), 'a').w).toBe(2);
    expect(at(resizeWidget([item('a', 8, 0, 4, 2)], 'a', 'right', 12), 'a').w).toBe(4);
  });

  it('stops at a neighbor beside it, but pushes widgets below it down', () => {
    expect(resizeWidget(layout, 'a', 'right', 12)).toEqual(layout);
    const below = [item('a', 0, 0, 4, 3), item('b', 0, 3, 4, 2)];
    const taller = resizeWidget(below, 'a', 'down', 12);
    expect(at(taller, 'b').y).toBe(4);
    expect(noOverlaps(taller)).toBe(true);
  });
});

describe('resizeFromLeft', () => {
  const start = item('a', 4, 0, 4, 3, 2, 2);

  it('keeps the right edge where it was', () => {
    expect(at(resizeFromLeft([start], start, -2, 1, 12), 'a')).toEqual({ x: 2, y: 0, w: 6, h: 4 });
    expect(at(resizeFromLeft([start], start, 1, -1, 12), 'a')).toEqual({ x: 5, y: 0, w: 3, h: 2 });
  });

  it('stops at the grid edge and the minimum size', () => {
    expect(at(resizeFromLeft([start], start, -9, 0, 12), 'a')).toEqual({ x: 0, y: 0, w: 8, h: 3 });
    expect(at(resizeFromLeft([start], start, 5, -5, 12), 'a')).toEqual({ x: 6, y: 0, w: 2, h: 2 });
  });

  it('stops at a widget on its left, even a taller one that starts higher', () => {
    const neighbor = { ...start, y: 2 };
    const result = resizeFromLeft([item('l', 0, 0, 3, 8), neighbor], neighbor, -3, 0, 12);
    expect(at(result, 'a')).toEqual({ x: 3, y: 0, w: 5, h: 3 }); // Floats up: nothing is above it.
    expect(at(result, 'l')).toEqual({ x: 0, y: 0, w: 3, h: 8 });
  });
});

describe('gridSteps', () => {
  it('rounds to whole columns or rows', () => {
    expect(gridSteps(70, 100)).toBe(1);
    expect(gridSteps(-160, 100)).toBe(-2);
    expect(gridSteps(40, 100)).toBe(0);
  });
});
