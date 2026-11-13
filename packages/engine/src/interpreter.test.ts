import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, LogicGraph } from './graph';
import { Interpreter } from './interpreter';
import { GraphError, type HostApi } from './types';

function makeHost(vars: Record<string, unknown> = {}) {
  const props: Record<string, Record<string, unknown>> = {};
  const toasts: string[] = [];
  const storage: Record<string, unknown> = {};
  const host: HostApi = {
    getVar: (id) => vars[id],
    setVar: (id, v) => {
      vars[id] = v;
    },
    getElementValue: (id) => props[id]?.value ?? '',
    setElementProp: (id, p, v) => {
      (props[id] ??= {})[p] = v;
    },
    toast: (m) => toasts.push(m),
    navigate: () => {},
    storageGet: (k) => storage[k],
    storageSet: (k, v) => {
      storage[k] = v;
    },
    sleep: async () => {},
    httpRequest: async () => {
      throw new Error('offline');
    },
  };
  return { host, vars, props, toasts, storage };
}

let y = 0;
const n = (id: string, type: string, config: Record<string, unknown> = {}): GraphNode => ({
  id,
  type,
  config,
  position: { x: 0, y: y++ },
});
const ex = (source: string, sourcePin: string, target: string): GraphEdge => ({
  id: `${source}-${sourcePin}-${target}`,
  source,
  sourcePin,
  target,
  targetPin: 'in',
  kind: 'exec',
});
const da = (source: string, sourcePin: string, target: string, targetPin: string): GraphEdge => ({
  id: `${source}-${sourcePin}-${target}-${targetPin}`,
  source,
  sourcePin,
  target,
  targetPin,
  kind: 'data',
});

describe('Interpreter', () => {
  it('runs an exec chain with inline and connected data inputs', async () => {
    const { host, props } = makeHost();
    host.setElementProp('name', 'value', 'Ada');
    const graph: LogicGraph = {
      nodes: [
        n('click', 'event.click', { element: 'btn' }),
        n('get', 'data.getInputValue', { element: 'name' }),
        n('join', 'data.join', { a: 'Hello ' }),
        n('set', 'action.setText', { element: 'label' }),
      ],
      edges: [ex('click', 'next', 'set'), da('get', 'value', 'join', 'b'), da('join', 'value', 'set', 'text')],
    };
    const it = new Interpreter(graph, host);
    await it.trigger('click', (c) => c.element === 'btn');
    expect(props.label.text).toBe('Hello Ada');
  });

  it('only triggers matching event nodes', async () => {
    const { host, toasts } = makeHost();
    const graph: LogicGraph = {
      nodes: [n('c1', 'event.click', { element: 'a' }), n('t', 'action.toast', { message: 'A' })],
      edges: [ex('c1', 'next', 't')],
    };
    await new Interpreter(graph, host).trigger('click', (c) => c.element === 'b');
    expect(toasts).toEqual([]);
  });

  it('branches with If / otherwise', async () => {
    const { host, toasts } = makeHost({ v: 7 });
    const graph: LogicGraph = {
      nodes: [
        n('e', 'event.screenLoad', { screen: 's' }),
        n('get', 'data.getVariable', { variable: 'v' }),
        n('cmp', 'data.compare', { op: '>', b: '5' }),
        n('if', 'flow.if'),
        n('yes', 'action.toast', { message: 'big' }),
        n('no', 'action.toast', { message: 'small' }),
      ],
      edges: [
        ex('e', 'next', 'if'),
        da('get', 'value', 'cmp', 'a'),
        da('cmp', 'value', 'if', 'condition'),
        ex('if', 'then', 'yes'),
        ex('if', 'else', 'no'),
      ],
    };
    await new Interpreter(graph, host).runEvent('e');
    expect(toasts).toEqual(['big']);
  });

  it('repeats N times then continues with done', async () => {
    const { host, vars } = makeHost({ total: 0 });
    const graph: LogicGraph = {
      nodes: [
        n('e', 'event.screenLoad', { screen: 's' }),
        n('rep', 'flow.repeat', { times: 4 }),
        n('add', 'action.changeVariable', { variable: 'total' }),
        n('done', 'action.setVariable', { variable: 'finished', value: 'yes' }),
      ],
      edges: [
        ex('e', 'next', 'rep'),
        ex('rep', 'body', 'add'),
        da('rep', 'count', 'add', 'amount'),
        ex('rep', 'done', 'done'),
      ],
    };
    await new Interpreter(graph, host).runEvent('e');
    expect(vars.total).toBe(1 + 2 + 3 + 4);
    expect(vars.finished).toBe('yes');
  });

  it('iterates a list with For each, re-evaluating data per item', async () => {
    const { host, vars } = makeHost({ items: ['a', 'b', 'c'], out: [] });
    const graph: LogicGraph = {
      nodes: [
        n('e', 'event.screenLoad', { screen: 's' }),
        n('list', 'data.getVariable', { variable: 'items' }),
        n('each', 'flow.forEach'),
        n('join', 'data.join', { b: '!' }),
        n('push', 'action.addToList', { variable: 'out' }),
      ],
      edges: [
        ex('e', 'next', 'each'),
        da('list', 'value', 'each', 'list'),
        ex('each', 'body', 'push'),
        da('each', 'item', 'join', 'a'),
        da('join', 'value', 'push', 'item'),
      ],
    };
    await new Interpreter(graph, host).runEvent('e');
    expect(vars.out).toEqual(['a!', 'b!', 'c!']);
  });

  it('exposes event payload as data outputs', async () => {
    const { host, vars } = makeHost({ list: ['x', 'y', 'z'] });
    const graph: LogicGraph = {
      nodes: [
        n('e', 'event.listDelete', { element: 'L' }),
        n('rm', 'action.removeFromList', { variable: 'list' }),
      ],
      edges: [ex('e', 'next', 'rm'), da('e', 'index', 'rm', 'index')],
    };
    await new Interpreter(graph, host).trigger('listDelete', () => true, { index: 2, item: 'y' });
    expect(vars.list).toEqual(['x', 'z']);
  });

  it('converts types forgivingly', async () => {
    const { host, vars } = makeHost();
    const graph: LogicGraph = {
      nodes: [
        n('e', 'event.screenLoad', { screen: 's' }),
        n('t', 'data.text', { value: '40' }),
        n('m', 'data.math', { op: '+', b: 2 }),
        n('set', 'action.setVariable', { variable: 'r' }),
      ],
      edges: [ex('e', 'next', 'set'), da('t', 'value', 'm', 'a'), da('m', 'value', 'set', 'value')],
    };
    await new Interpreter(graph, host).runEvent('e');
    expect(vars.r).toBe(42);
  });

  it('stops endless loops with a friendly error', async () => {
    const { host } = makeHost({ x: 0 });
    const graph: LogicGraph = {
      nodes: [
        n('e', 'event.screenLoad', { screen: 's' }),
        n('a', 'action.changeVariable', { variable: 'x' }),
        n('b', 'action.changeVariable', { variable: 'x' }),
      ],
      edges: [ex('e', 'next', 'a'), ex('a', 'next', 'b'), ex('b', 'next', 'a')],
    };
    const errors: GraphError[] = [];
    await new Interpreter(graph, host, { maxSteps: 100, onError: (e) => errors.push(e) }).runEvent('e');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/too many steps/);
  });

  it('reports unconfigured blocks with the node id', async () => {
    const { host } = makeHost();
    const graph: LogicGraph = {
      nodes: [n('e', 'event.screenLoad', { screen: 's' }), n('set', 'action.setText')],
      edges: [ex('e', 'next', 'set')],
    };
    await expect(new Interpreter(graph, host).runEvent('e')).rejects.toMatchObject({
      nodeId: 'set',
      message: expect.stringMatching(/no element picked/),
    });
  });

  it('saves and loads from storage', async () => {
    const { host, vars } = makeHost({ v: [1, 2] });
    const graph: LogicGraph = {
      nodes: [
        n('e', 'event.screenLoad', { screen: 's' }),
        n('get', 'data.getVariable', { variable: 'v' }),
        n('save', 'action.saveStorage', { key: 'k' }),
        n('load', 'action.loadStorage', { key: 'k' }),
        n('set', 'action.setVariable', { variable: 'copy' }),
      ],
      edges: [
        ex('e', 'next', 'save'),
        da('get', 'value', 'save', 'value'),
        ex('save', 'next', 'load'),
        ex('load', 'next', 'set'),
        da('load', 'value', 'set', 'value'),
      ],
    };
    await new Interpreter(graph, host).runEvent('e');
    expect(vars.copy).toEqual([1, 2]);
  });

  it('reports node runs for highlighting', async () => {
    const { host } = makeHost();
    const ran: string[] = [];
    const graph: LogicGraph = {
      nodes: [n('e', 'event.screenLoad', { screen: 's' }), n('t', 'action.toast')],
      edges: [ex('e', 'next', 't')],
    };
    await new Interpreter(graph, host, { onNodeRun: (id) => ran.push(id) }).runEvent('e');
    expect(ran).toEqual(['e', 't']);
  });

  it('reports each value read through a data wire', async () => {
    const { host } = makeHost();
    host.setElementProp('name', 'value', 'Ada');
    const graph: LogicGraph = {
      nodes: [
        n('click', 'event.click', { element: 'btn' }),
        n('get', 'data.getInputValue', { element: 'name' }),
        n('join', 'data.join', { a: 'Hello ' }),
        n('set', 'action.setText', { element: 'label' }),
        n('rep', 'flow.repeat', { times: 3 }),
        n('toast', 'action.toast'),
      ],
      edges: [
        ex('click', 'next', 'set'),
        ex('set', 'next', 'rep'),
        ex('rep', 'body', 'toast'),
        da('get', 'value', 'join', 'b'),
        da('join', 'value', 'set', 'text'),
        da('rep', 'count', 'toast', 'message'),
      ],
    };
    const seen: [string, unknown][] = [];
    await new Interpreter(graph, host, { onValue: (id, v) => seen.push([id, v]) }).trigger(
      'click',
      (c) => c.element === 'btn',
    );
    expect(seen).toEqual([
      ['get-value-join-b', 'Ada'],
      ['join-value-set-text', 'Hello Ada'],
      // A loop's wire reports every pass.
      ['rep-count-toast-message', 1],
      ['rep-count-toast-message', 2],
      ['rep-count-toast-message', 3],
    ]);
  });

  it('reports the blocks that run, with event data and the inputs they read', async () => {
    const { host } = makeHost();
    const graph: LogicGraph = {
      nodes: [
        n('change', 'event.inputChange', { element: 'box' }),
        n('join', 'data.join', { a: 'Hi ' }),
        n('set', 'action.setText', { element: 'label' }),
      ],
      edges: [ex('change', 'next', 'set'), da('change', 'value', 'join', 'b'), da('join', 'value', 'set', 'text')],
    };
    const log: unknown[] = [];
    await new Interpreter(graph, host, {
      onNodeRun: (id, payload) => log.push(['run', id, payload]),
      onInput: (id, pin, value) => log.push(['input', id, pin, value]),
    }).trigger('change', (c) => c.element === 'box', { value: 'Bo' });
    // Value blocks (Join) don't run on their own: their result shows as the input of the block that used it.
    expect(log).toEqual([
      ['run', 'change', { value: 'Bo' }],
      ['run', 'set', undefined],
      ['input', 'set', 'text', 'Hi Bo'],
    ]);
  });
});
