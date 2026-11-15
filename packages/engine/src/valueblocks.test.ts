import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GraphEdge, GraphNode, LogicGraph } from './graph';
import { Interpreter } from './interpreter';
import { defaultConfig, NODE_DEFS } from './registry';

const ALL_NODE_DEFS = Object.values(NODE_DEFS);
import type { HostApi, NameLookup } from './types';

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

function fakeHost(vars: Record<string, unknown> = {}) {
  const props: [string, string, unknown][] = [];
  const host: HostApi = {
    getVar: (id) => vars[id],
    setVar: (id, v) => {
      vars[id] = v;
    },
    getElementValue: () => '',
    setElementProp: (id, prop, value) => void props.push([id, prop, value]),
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
  return { host, vars, props };
}

/**
 * Runs one value block and returns its result. `config` holds typed-in values;
 * `inputs` are wired in from the variables named by their keys.
 */
async function value(type: string, config: Record<string, unknown> = {}, inputs: Record<string, unknown> = {}) {
  const { host, vars } = fakeHost({ ...inputs });
  const graph: LogicGraph = {
    nodes: [node('start', 'event.screenLoad', { screen: 's' }), node('block', type, config), node('save', 'action.setVariable', { variable: 'out' })],
    edges: [edge('start', 'next', 'save', 'in', 'exec'), edge('block', 'value', 'save', 'value', 'data')],
  };
  for (const pin of Object.keys(inputs)) {
    graph.nodes.push(node(`get-${pin}`, 'data.getVariable', { variable: pin }));
    graph.edges.push(edge(`get-${pin}`, 'value', 'block', pin, 'data'));
  }
  await new Interpreter(graph, host).runEvent('start');
  return vars.out;
}

describe('yes / no blocks', () => {
  it('a fixed Yes / No value, and a fixed number', async () => {
    expect(await value('data.boolean', { value: false })).toBe(false);
    expect(await value('data.boolean', {})).toBe(true);
    expect(await value('data.number', { value: '12.5' })).toBe(12.5);
  });

  it.each([
    ['and', true, true, true],
    ['and', true, false, false],
    ['or', false, true, true],
    ['or', false, false, false],
  ])('%s of %s and %s is %s', async (op, a, b, result) => {
    expect(await value('data.logic', { op, a, b })).toBe(result);
  });

  it('Not flips a value, reading text such as “false” as no', async () => {
    expect(await value('data.not', { a: true })).toBe(false);
    expect(await value('data.not', {}, { a: 'false' })).toBe(true);
  });

  it.each([
    ['=', 3, '3', true],
    ['!=', 'a', 'b', true],
    ['>', 10, 9, true],
    ['<', 10, 9, false],
  ])('Compare: %s of %s and %s is %s', async (op, a, b, result) => {
    expect(await value('data.compare', { op }, { a, b })).toBe(result);
  });

  it('Compare: “is empty” doesn’t need B', async () => {
    expect(await value('data.compare', { op: 'empty' }, { a: '' })).toBe(true);
    expect(await value('data.compare', { op: 'empty' }, { a: 'x' })).toBe(false);
  });
});

describe('Random number', () => {
  afterEach(() => vi.restoreAllMocks());

  it('picks whole numbers from the lower end to the upper end, either way round', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(await value('data.random', { min: 1, max: 6 })).toBe(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    expect(await value('data.random', { min: 1, max: 6 })).toBe(6);
    expect(await value('data.random', { min: 6, max: 1 })).toBe(6);
    // Ends that aren't whole numbers are brought inside.
    expect(await value('data.random', { min: 0.5, max: 2.5 })).toBe(2);
  });
});

describe('lists', () => {
  it('counts items, and treats a missing list as empty', async () => {
    expect(await value('data.listLength', {}, { list: ['a', 'b', 'c'] })).toBe(3);
    expect(await value('data.listLength')).toBe(0);
  });

  it('gets the item at a position, 1 being the first, or nothing when there is none', async () => {
    const list = ['a', 'b', 'c'];
    expect(await value('data.listItem', { index: 1 }, { list })).toBe('a');
    expect(await value('data.listItem', { index: 3 }, { list })).toBe('c');
    expect(await value('data.listItem', { index: 2.6 }, { list })).toBe('c');
    expect(await value('data.listItem', { index: 4 }, { list })).toBe('');
    expect(await value('data.listItem', { index: 0 }, { list })).toBe('');
  });
});

describe('Show / hide', () => {
  it('sets whether an element shows, and needs an element', async () => {
    const { host, props } = fakeHost();
    const graph: LogicGraph = {
      nodes: [node('start', 'event.screenLoad', { screen: 's' }), node('hide', 'action.setVisible', { element: 'el1', visible: false })],
      edges: [edge('start', 'next', 'hide', 'in', 'exec')],
    };
    await new Interpreter(graph, host).runEvent('start');
    expect(props).toEqual([['el1', 'visible', false]]);
    const def = ALL_NODE_DEFS.find((d) => d.type === 'action.setVisible')!;
    expect(def.validate?.({})).toBe('This “Show / hide” block has no element picked.');
    expect(def.validate?.({ element: 'el1' })).toBeNull();
  });
});

describe('every block describes itself', () => {
  const names: NameLookup = {
    element: (id) => (id ? `“El ${String(id)}”` : undefined),
    variable: (id) => (id ? `“Var ${String(id)}”` : undefined),
    screen: (id) => (id ? `“Screen ${String(id)}”` : undefined),
    inList: () => false,
    table: (id) => (id ? `“Table ${String(id)}”` : undefined),
  };

  it.each(ALL_NODE_DEFS.filter((d) => d.sentence).map((d) => [d.type, d] as const))('%s', (_, def) => {
    // Not set up yet, and then pointing at things.
    const empty = def.sentence!(defaultConfig(def), names);
    expect(typeof empty).toBe('string');
    expect(empty.trim()).not.toBe('');
    const set = Object.fromEntries(def.configFields.map((f) => [f.key, f.type === 'number' ? 3 : 'x']));
    const filled = def.sentence!({ ...defaultConfig(def), ...set }, names);
    expect(filled.trim()).not.toBe('');
    expect(filled).not.toContain('undefined');
  });
});
