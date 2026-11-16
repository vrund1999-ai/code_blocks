// Tidies up the logic graph: puts every block in a neat place, with one click.

import type { GraphEdge, GraphNode } from '../model/types';

type Size = { width: number; height: number };
type Point = { x: number; y: number };

/** Blocks not shown yet have no measured size; this is about a block's usual size. */
export const DEFAULT_SIZE: Size = { width: 240, height: 120 };
/** Space between columns, between blocks in a column, and between groups of blocks. */
export const GAP = { x: 80, y: 30, group: 80 };
const START: Point = { x: 40, y: 40 };

/**
 * New positions for every block, laid out so the graph reads left to right:
 *
 * - Blocks wired together form a group, and groups are stacked top to bottom,
 *   in the order they were in (by their top block).
 * - In a group, a block with no white arrow into it (a *When…* block, say)
 *   starts the first column. Each block an arrow leads to goes one column to
 *   the right of where the arrow comes from (the furthest, if several do).
 * - A value block goes one column left of the first block it feeds.
 * - In a column, blocks joined by white arrows come first, so a chain of
 *   arrows stays on one row, then value blocks; each keeps its order from top
 *   to bottom.
 */
export function tidyGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sizeOf: (id: string) => Size | undefined = () => undefined,
): Record<string, Point> {
  const ids = new Set(nodes.map((n) => n.id));
  const wires = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const size = (id: string) => sizeOf(id) ?? DEFAULT_SIZE;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Groups: blocks connected by any wire.
  const group = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (group.get(root) !== root) root = group.get(root)!;
    group.set(id, root);
    return root;
  };
  for (const n of nodes) group.set(n.id, n.id);
  for (const e of wires) group.set(find(e.source), find(e.target));

  // Columns along the white arrows: the longest way from a block with none coming in.
  const execOut = new Map<string, string[]>();
  const execIn = new Map<string, number>();
  for (const e of wires) {
    if (e.kind !== 'exec') continue;
    execOut.set(e.source, [...(execOut.get(e.source) ?? []), e.target]);
    execIn.set(e.target, (execIn.get(e.target) ?? 0) + 1);
  }
  const inFlow = new Set<string>();
  for (const e of wires) if (e.kind === 'exec') inFlow.add(e.source).add(e.target);
  const column = new Map<string, number>();
  const visit = (id: string, col: number, path: Set<string>) => {
    // A loop of arrows (a block leading back to an earlier one) stops here.
    if (path.has(id) || (column.get(id) ?? -1) >= col) return;
    column.set(id, col);
    path.add(id);
    for (const next of execOut.get(id) ?? []) visit(next, col + 1, path);
    path.delete(id);
  };
  for (const id of inFlow) if (!execIn.get(id)) visit(id, 0, new Set());
  // Arrows only in a loop, with no start: start from the top block.
  for (const id of [...inFlow].sort((a, b) => byId.get(a)!.position.y - byId.get(b)!.position.y)) {
    if (!column.has(id)) visit(id, 0, new Set());
  }

  // Value blocks: one column left of the first block they feed, worked out
  // from the blocks they feed, a few times over for values feeding values.
  const feeds = new Map<string, string[]>();
  for (const e of wires) if (e.kind === 'data') feeds.set(e.source, [...(feeds.get(e.source) ?? []), e.target]);
  const values = nodes.filter((n) => !inFlow.has(n.id)).map((n) => n.id);
  for (let round = 0; round <= values.length; round++) {
    let changed = false;
    for (const id of values) {
      const placed = (feeds.get(id) ?? []).filter((t) => column.has(t)).map((t) => column.get(t)! - 1);
      if (!placed.length) continue;
      const col = Math.min(...placed);
      if (column.get(id) !== col) {
        column.set(id, col);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Blocks left over (on their own, or values that feed nothing placed) start a column.
  for (const n of nodes) if (!column.has(n.id)) column.set(n.id, 0);

  // Lay out each group in its own band.
  const groups = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const g = find(n.id);
    groups.set(g, [...(groups.get(g) ?? []), n]);
  }
  const top = (ns: GraphNode[]) => Math.min(...ns.map((n) => n.position.y));
  const left = (ns: GraphNode[]) => Math.min(...ns.map((n) => n.position.x));
  const ordered = [...groups.values()].sort((a, b) => top(a) - top(b) || left(a) - left(b));

  const out: Record<string, Point> = {};
  let y = START.y;
  for (const members of ordered) {
    const lowest = Math.min(...members.map((n) => column.get(n.id)!));
    const columns: GraphNode[][] = [];
    for (const n of members) (columns[column.get(n.id)! - lowest] ??= []).push(n);
    let x = START.x;
    let height = 0;
    for (const col of columns) {
      if (!col) continue;
      const flowFirst = (a: GraphNode, b: GraphNode) => Number(inFlow.has(b.id)) - Number(inFlow.has(a.id));
      col.sort((a, b) => flowFirst(a, b) || a.position.y - b.position.y || a.position.x - b.position.x);
      let cy = y;
      for (const n of col) {
        out[n.id] = { x, y: cy };
        cy += size(n.id).height + GAP.y;
      }
      height = Math.max(height, cy - GAP.y - y);
      x += Math.max(...col.map((n) => size(n.id).width)) + GAP.x;
    }
    y += height + GAP.group;
  }
  return out;
}
