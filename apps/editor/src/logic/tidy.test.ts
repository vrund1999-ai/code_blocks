import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../model/types';
import { DEFAULT_SIZE, GAP, tidyGraph } from './tidy';

let n = 0;
const node = (id: string, x = 0, y = 0): GraphNode => ({ id, type: 'x', config: {}, position: { x, y } });
const exec = (source: string, target: string): GraphEdge => ({ id: `e${++n}`, source, sourcePin: 'next', target, targetPin: 'in', kind: 'exec' });
const data = (source: string, target: string): GraphEdge => ({ id: `e${++n}`, source, sourcePin: 'value', target, targetPin: 'v', kind: 'data' });

const COL = DEFAULT_SIZE.width + GAP.x;
const ROW = DEFAULT_SIZE.height + GAP.y;
const BAND = DEFAULT_SIZE.height + GAP.group;

describe('tidying the logic graph', () => {
  it('lays a chain of arrows out left to right, from where it starts', () => {
    // Scattered, and listed out of order.
    const pos = tidyGraph([node('c', 900, 500), node('a', 300, 20), node('b', 10, 300)], [exec('a', 'b'), exec('b', 'c')]);
    expect(pos).toEqual({ a: { x: 40, y: 40 }, b: { x: 40 + COL, y: 40 }, c: { x: 40 + 2 * COL, y: 40 } });
  });

  it('puts a value block one column left of the block it feeds, below what’s there', () => {
    const pos = tidyGraph(
      [node('when', 0, 0), node('set', 0, 100), node('join', 0, 200), node('name', 0, 300)],
      [exec('when', 'set'), data('join', 'set'), data('name', 'join')],
    );
    // A value feeding a value goes further left, so the group starts there.
    expect(pos.name).toEqual({ x: 40, y: 40 });
    expect(pos.when).toEqual({ x: 40 + COL, y: 40 });
    expect(pos.join).toEqual({ x: 40 + COL, y: 40 + ROW });
    expect(pos.set).toEqual({ x: 40 + 2 * COL, y: 40 });
  });

  it('puts a value block that feeds only one block on its own next to it', () => {
    const pos = tidyGraph([node('when', 0, 0), node('set', 0, 100), node('text', 0, 200)], [exec('when', 'set'), data('text', 'set')]);
    expect(pos.when).toEqual({ x: 40, y: 40 });
    expect(pos.text).toEqual({ x: 40, y: 40 + ROW });
    expect(pos.set).toEqual({ x: 40 + COL, y: 40 });
  });

  it('keeps a chain of arrows on one row, with value blocks below it, even ones that were higher', () => {
    const pos = tidyGraph([node('value', 0, 0), node('when', 0, 500), node('set', 0, 600)], [exec('when', 'set'), data('value', 'set')]);
    expect(pos.when).toEqual({ x: 40, y: 40 });
    expect(pos.set).toEqual({ x: 40 + COL, y: 40 });
    expect(pos.value).toEqual({ x: 40, y: 40 + ROW });
  });

  it('puts the branches of a block side by side in the next column, keeping their order', () => {
    const pos = tidyGraph(
      [node('if', 0, 0), node('no', 500, 400), node('yes', 500, 100), node('after', 900, 0)],
      [exec('if', 'yes'), exec('if', 'no'), exec('yes', 'after'), exec('no', 'after')],
    );
    expect(pos.yes).toEqual({ x: 40 + COL, y: 40 });
    expect(pos.no).toEqual({ x: 40 + COL, y: 40 + ROW });
    expect(pos.after).toEqual({ x: 40 + 2 * COL, y: 40 });
  });

  it('stacks unconnected groups top to bottom, in the order they were in', () => {
    const pos = tidyGraph(
      [node('second', 0, 800), node('first', 600, 50), node('first2', 0, 900), node('alone', 0, 1200)],
      [exec('first', 'first2')],
    );
    expect(pos.first).toEqual({ x: 40, y: 40 });
    expect(pos.first2).toEqual({ x: 40 + COL, y: 40 });
    expect(pos.second).toEqual({ x: 40, y: 40 + BAND });
    expect(pos.alone).toEqual({ x: 40, y: 40 + 2 * BAND });
  });

  it('uses each block’s measured size, so tall and wide blocks don’t overlap', () => {
    const sizes: Record<string, { width: number; height: number }> = {
      a: { width: 400, height: 300 },
      v: { width: 100, height: 50 },
    };
    const pos = tidyGraph(
      [node('a', 0, 0), node('v', 0, 10), node('b', 0, 20), node('c', 0, 900)],
      [exec('a', 'b'), data('v', 'b')],
      (id) => sizes[id],
    );
    expect(pos.v).toEqual({ x: 40, y: 40 + 300 + GAP.y });
    expect(pos.b).toEqual({ x: 40 + 400 + GAP.x, y: 40 });
    expect(pos.c.y).toBe(40 + 300 + GAP.y + 50 + GAP.group);
  });

  it('copes with arrows that loop back, and wires to blocks that are gone', () => {
    const pos = tidyGraph([node('a', 0, 0), node('b', 0, 100)], [exec('a', 'b'), exec('b', 'a'), exec('b', 'ghost'), data('ghost', 'a')]);
    expect(pos.a).toEqual({ x: 40, y: 40 });
    expect(pos.b).toEqual({ x: 40 + COL, y: 40 });
    expect(Object.keys(pos)).toEqual(['a', 'b']);
  });

  it('gives an empty graph nothing to move', () => {
    expect(tidyGraph([], [])).toEqual({});
  });
});
