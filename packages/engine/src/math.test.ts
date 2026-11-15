import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, LogicGraph } from './graph';
import { Interpreter } from './interpreter';
import { calculate, MAX_PLACES, roundNumber } from './nodes/data';
import { getNodeDef } from './registry';
import type { HostApi } from './types';

const node = (id: string, type: string, config: Record<string, unknown> = {}): GraphNode => ({
  id,
  type,
  config,
  position: { x: 0, y: 0 },
});
const edge = (source: string, sourcePin: string, target: string, targetPin: string, kind: GraphEdge['kind']): GraphEdge => ({
  id: `${source}.${sourcePin}->${target}.${targetPin}`,
  source,
  sourcePin,
  target,
  targetPin,
  kind,
});

/** Runs one value block with typed-in values (`config`) and returns its result. */
async function value(type: string, config: Record<string, unknown>) {
  const vars: Record<string, unknown> = {};
  const host: HostApi = {
    getVar: (id) => vars[id],
    setVar: (id, v) => {
      vars[id] = v;
    },
    getElementValue: () => '',
    setElementProp: () => {},
    toast: () => {},
    navigate: () => {},
    goBack: () => {},
    storageGet: () => undefined,
    storageSet: () => {},
    sleep: async () => {},
    httpRequest: async () => {
      throw new Error('offline');
    },
  };
  const graph: LogicGraph = {
    nodes: [node('start', 'event.screenLoad', { screen: 's' }), node('block', type, config), node('save', 'action.setVariable', { variable: 'out' })],
    edges: [edge('start', 'next', 'save', 'in', 'exec'), edge('block', 'value', 'save', 'value', 'data')],
  };
  await new Interpreter(graph, host).runEvent('start');
  return vars.out;
}

describe('Math block', () => {
  it('gives the remainder, the smaller and the bigger of two numbers', () => {
    expect(calculate('%', 17, 5)).toBe(2);
    expect(calculate('%', 10, 2.5)).toBe(0);
    expect(calculate('min', 3, -4)).toBe(-4);
    expect(calculate('max', 3, -4)).toBe(3);
  });

  it('gives 0 when dividing by zero, for the remainder too', () => {
    expect(calculate('/', 7, 0)).toBe(0);
    expect(calculate('%', 7, 0)).toBe(0);
  });

  it('keeps the first four operations', () => {
    expect([calculate('+', 6, 3), calculate('-', 6, 3), calculate('*', 6, 3), calculate('/', 6, 3)]).toEqual([9, 3, 18, 2]);
  });

  it('runs the new operations in a graph and describes them', async () => {
    expect(await value('data.math', { op: '%', a: 17, b: 5 })).toBe(2);
    expect(await value('data.math', { op: 'max', a: 2, b: 9 })).toBe(9);
    const names = { element: () => undefined, variable: () => undefined, screen: () => undefined, inList: () => false };
    const sentence = getNodeDef('data.math')!.sentence!;
    expect(sentence({ op: '%' }, names)).toBe('Remainder of A ÷ B');
    expect(sentence({ op: 'min' }, names)).toBe('Smaller of A and B');
    expect(sentence({}, names)).toBe('A + B');
  });
});

describe('Round number block', () => {
  it('rounds to the nearest whole number, halves away from zero', () => {
    expect(roundNumber(2.4, 0, 'nearest')).toBe(2);
    expect(roundNumber(2.5, 0, 'nearest')).toBe(3);
    expect(roundNumber(-2.5, 0, 'nearest')).toBe(-3);
    expect(roundNumber(-0.4, 0, 'nearest')).toBe(0);
    expect(Object.is(roundNumber(-0.4, 0, 'nearest'), -0)).toBe(false);
  });

  it('rounds down and up', () => {
    expect(roundNumber(2.9, 0, 'down')).toBe(2);
    expect(roundNumber(2.1, 0, 'up')).toBe(3);
    expect(roundNumber(-2.1, 0, 'down')).toBe(-3);
    expect(roundNumber(-2.9, 0, 'up')).toBe(-2);
  });

  it('keeps decimal places, rounding numbers as written', () => {
    expect(roundNumber(3.14159, 2, 'nearest')).toBe(3.14);
    expect(roundNumber(1.005, 2, 'nearest')).toBe(1.01);
    expect(roundNumber(1.234, 1, 'up')).toBe(1.3);
    expect(roundNumber(19.999, 2, 'down')).toBe(19.99);
  });

  it('handles odd decimal places and very large or small numbers', () => {
    expect(roundNumber(2.567, 1.6, 'nearest')).toBe(2.57); // 1.6 places counts as 2
    expect(roundNumber(2.5, -3, 'nearest')).toBe(3); // fewer than 0 counts as 0
    expect(roundNumber(Math.PI, 50, 'nearest')).toBe(roundNumber(Math.PI, MAX_PLACES, 'nearest'));
    expect(roundNumber(1e-7, 2, 'nearest')).toBe(0);
    expect(roundNumber(1.5e21, 0, 'nearest')).toBe(1.5e21);
    expect(roundNumber(Infinity, 0, 'nearest')).toBe(Infinity);
  });

  it('runs in a graph and describes itself', async () => {
    expect(await value('data.round', { a: 3.14159, places: 2 })).toBe(3.14);
    expect(await value('data.round', { a: 7.2, mode: 'up' })).toBe(8);
    const names = { element: () => undefined, variable: () => undefined, screen: () => undefined, inList: () => false };
    const sentence = getNodeDef('data.round')!.sentence!;
    expect(sentence({ mode: 'down' }, names)).toBe('Round down');
    expect(sentence({}, names)).toBe('Round to the nearest');
  });
});
