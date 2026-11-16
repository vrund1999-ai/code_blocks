// Where a dragged element lands in a grid Box.

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where (x, y) falls among the children of a grid, in reading order: before
 * the first child whose row is below the point, or that is on the point's row
 * and to its right.
 */
export function gridIndex(rects: (Rect | null)[], x: number, y: number): number {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!r) continue;
    if (y < r.top) return i;
    if (y < r.top + r.height && x < r.left + r.width / 2) return i;
  }
  return rects.length;
}
