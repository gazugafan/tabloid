/** Geometry for a seven-segment display drawn as SVG polygons, so it needs no font and takes the theme's colors. */

export const DIGIT_WIDTH = 10;
export const DIGIT_HEIGHT = 18;
export const ADVANCE = 12.5;
export const COLON_WIDTH = 3.5;
const D = 0.9; // half the segment thickness

type Point = [number, number];
const across = (y: number, x0: number, x1: number): Point[] => [[x0, y], [x0 + D, y - D], [x1 - D, y - D], [x1, y], [x1 - D, y + D], [x0 + D, y + D]];
const down = (x: number, y0: number, y1: number): Point[] => [[x, y0], [x + D, y0 + D], [x + D, y1 - D], [x, y1], [x - D, y1 - D], [x - D, y0 + D]];

/** The seven segments, named a (top) to g (middle) the usual way. */
export const SEGMENT_SHAPES: Record<string, string> = Object.fromEntries(
  Object.entries({
    a: across(D, 1.1, 8.9),
    b: down(9.1, 1.1, 8.9),
    c: down(9.1, 9.1, 16.9),
    d: across(DIGIT_HEIGHT - D, 1.1, 8.9),
    e: down(D, 9.1, 16.9),
    f: down(D, 1.1, 8.9),
    g: across(DIGIT_HEIGHT / 2, 1.1, 8.9),
  }).map(([name, points]) => [name, points.map(([x, y]) => `${x},${y}`).join(' ')]),
);

const LIT: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
/** Which segments are lit for a character ('' or a space leaves the digit blank). */
export const segmentsFor = (char: string): string[] => (LIT[char] ?? '').split('').filter(Boolean);

export interface SegmentCell {
  kind: 'digit' | 'colon';
  x: number;
  char: string;
}

/** The cells of a time like "05:07:19", with their x positions, and the total width. */
export function layoutTime(text: string): { cells: SegmentCell[]; width: number } {
  const cells: SegmentCell[] = [];
  let x = 0;
  for (const char of text) {
    if (char === ':') {
      cells.push({ kind: 'colon', x, char });
      x += COLON_WIDTH;
    } else {
      cells.push({ kind: 'digit', x, char });
      x += ADVANCE;
    }
  }
  return { cells, width: Math.max(0, x - (ADVANCE - DIGIT_WIDTH)) };
}

/** Hours, minutes and (optionally) seconds as the display shows them. A 12-hour clock leaves the first hour digit blank. */
export function displayText(date: Date, hour12: boolean, seconds: boolean): { text: string; pm: boolean } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = hour12 ? date.getHours() % 12 || 12 : date.getHours();
  const hh = hour12 ? String(hours).padStart(2, ' ') : pad(hours);
  return { text: `${hh}:${pad(date.getMinutes())}${seconds ? `:${pad(date.getSeconds())}` : ''}`, pm: date.getHours() >= 12 };
}
