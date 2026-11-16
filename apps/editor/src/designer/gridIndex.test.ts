import { describe, expect, it } from 'vitest';
import { gridIndex } from './gridIndex';

// Two columns, 100 wide and 50 high, in two rows; the last row has one item.
const cell = (col: number, row: number) => ({ left: col * 110, top: row * 60, width: 100, height: 50 });
const rects = [cell(0, 0), cell(1, 0), cell(0, 1)];

describe('dropping into a grid', () => {
  it('goes before the item to the right of the pointer, on its row', () => {
    expect(gridIndex(rects, 10, 20)).toBe(0);
    expect(gridIndex(rects, 80, 20)).toBe(1);
    expect(gridIndex(rects, 150, 20)).toBe(1);
    expect(gridIndex(rects, 10, 80)).toBe(2);
  });

  it('goes after the last item of a row when right of it', () => {
    expect(gridIndex(rects, 200, 20)).toBe(2);
    expect(gridIndex(rects, 80, 80)).toBe(3);
    // In the empty cell next to the last item, or below every row.
    expect(gridIndex(rects, 150, 80)).toBe(3);
    expect(gridIndex(rects, 10, 500)).toBe(3);
  });

  it('goes before a row the pointer is above, as in the gap between rows', () => {
    expect(gridIndex(rects, 200, 55)).toBe(2);
  });

  it('skips items it can’t measure, and an empty grid takes the first place', () => {
    expect(gridIndex([null, cell(1, 0)], 150, 20)).toBe(1);
    expect(gridIndex([], 0, 0)).toBe(0);
  });
});
