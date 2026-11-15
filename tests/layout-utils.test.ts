import { describe, expect, it } from 'vitest';
import type { WidgetInstance } from '../types/layout';
import { nextY, reorderGeometry, rowsToPx, sortForStack } from '../utils/layout';

const w = (id: string, x: number, y: number, h = 2): WidgetInstance => ({ id, dashboard: 'home', type: 't', x, y, w: 2, h, config: {} });

describe('layout utils', () => {
  it('orders the single-column stack by y then x without mutating input', () => {
    const input = [w('c', 4, 2), w('b', 6, 0), w('a', 0, 0)];
    expect(sortForStack(input).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('finds the first free row below all widgets', () => {
    expect(nextY([])).toBe(0);
    expect(nextY([w('a', 0, 0, 3), w('b', 2, 4, 2)])).toBe(6);
  });

  it('converts rows to pixels including gaps', () => {
    expect(rowsToPx(1)).toBe(40);
    expect(rowsToPx(3)).toBe(3 * 40 + 2 * 16);
  });

  describe('reorderGeometry', () => {
    const a = w('a', 0, 0, 2);
    const b = { ...w('b', 6, 0, 4), w: 3 };
    const c = w('c', 0, 4, 2);

    it('returns null for unchanged or invalid orders', () => {
      expect(reorderGeometry([a, b, c], ['a', 'b', 'c'])).toBeNull();
      expect(reorderGeometry([a, b, c], ['a', 'b'])).toBeNull();
      expect(reorderGeometry([a, b, c], ['a', 'a', 'c'])).toBeNull();
      expect(reorderGeometry([a, b, c], ['a', 'b', 'x'])).toBeNull();
    });

    it('moves widgets into earlier slots while keeping their own sizes', () => {
      const result = reorderGeometry([a, b, c], ['c', 'a', 'b'])!;
      expect(result.find((g) => g.id === 'c')).toMatchObject({ x: 0, y: 0, h: 2 });
      expect(result.find((g) => g.id === 'a')).toMatchObject({ x: 6, y: 0, h: 2 });
      expect(result.find((g) => g.id === 'b')).toMatchObject({ x: 0, y: 4, h: 4, w: 3 });
    });

    it('produces geometry whose reading order matches the requested order', () => {
      const result = reorderGeometry([a, b, c], ['b', 'c', 'a'])!;
      const moved = [a, b, c].map((x) => ({ ...x, ...result.find((g) => g.id === x.id)! }));
      expect(sortForStack(moved).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    });
  });
});
