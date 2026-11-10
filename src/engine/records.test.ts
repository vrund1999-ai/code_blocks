import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, LogicGraph } from '../model/types';
import { findField, isEmptyValue, isRecord, looseEquals, toBool, toRecord, toText } from './convert';
import { Interpreter } from './interpreter';
import { fieldPinId } from './nodes/records';
import { canConnect, findPin, getNodeDef, inputPins } from './registry';
import { GraphError, type HostApi, type Pin } from './types';

function makeHost(vars: Record<string, unknown> = {}) {
  const props: Record<string, Record<string, unknown>> = {};
  const toasts: string[] = [];
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
    storageGet: () => undefined,
    storageSet: () => {},
    sleep: async () => {},
  };
  return { host, vars, props, toasts };
}

let y = 0;
const n = (id: string, type: string, config: Record<string, unknown> = {}): GraphNode => ({
  id,
  type,
  config,
  position: { x: 0, y: y++ },
});
const ex = (source: string, target: string, sourcePin = 'next'): GraphEdge => ({
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

/** Runs a screen-load event wired to the given chain of action blocks. */
async function run(nodes: GraphNode[], edges: GraphEdge[], vars: Record<string, unknown> = {}) {
  const h = makeHost(vars);
  const graph: LogicGraph = { nodes: [n('start', 'event.screenLoad', { screen: 's' }), ...nodes], edges };
  await new Interpreter(graph, h.host).runEvent('start');
  return h;
}

const fields = (...names: string[]) => names.map((name, i) => ({ id: `k${i}`, name }));

describe('record conversions', () => {
  it('recognises records but not lists or null', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(toRecord('x')).toEqual({});
    expect(toRecord([1])).toEqual({});
  });

  it('shows records as readable text', () => {
    expect(toText({ name: 'Ada', age: 36 })).toBe('name: Ada, age: 36');
    expect(toText({ pet: { name: 'Rex' }, tags: ['a', 'b'] })).toBe('pet: (name: Rex), tags: a, b');
    expect(toText([{ name: 'Ada' }, { name: 'Bo' }])).toBe('name: Ada, name: Bo');
    expect(toText({})).toBe('');
  });

  it('treats an empty record as empty / false', () => {
    expect(toBool({})).toBe(false);
    expect(toBool({ a: 1 })).toBe(true);
    expect(isEmptyValue({})).toBe(true);
    expect(isEmptyValue({ a: '' })).toBe(false);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue('  ')).toBe(true);
  });

  it('compares records by their contents', () => {
    expect(looseEquals({ a: 1 }, { a: 1 })).toBe(true);
    expect(looseEquals({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('finds fields ignoring case and spaces, preferring an exact match', () => {
    expect(findField({ Name: 'x' }, 'name')).toBe('Name');
    expect(findField({ name: 'x' }, ' NAME ')).toBe('name');
    expect(findField({ name: 'a', Name: 'b' }, 'Name')).toBe('Name');
    expect(findField({ name: 'x' }, 'age')).toBeUndefined();
    expect(findField({ name: 'x' }, '')).toBeUndefined();
  });
});

describe('record wiring rules', () => {
  const pin = (valueType: Pin['valueType']): Pin => ({ id: 'p', label: '', kind: 'data', valueType });

  it('connects records to records, "any" and text only', () => {
    expect(canConnect(pin('record'), pin('record'))).toBe(true);
    expect(canConnect(pin('record'), pin('any'))).toBe(true);
    expect(canConnect(pin('any'), pin('record'))).toBe(true);
    expect(canConnect(pin('record'), pin('text'))).toBe(true);
    expect(canConnect(pin('record'), pin('number'))).toBe(false);
    expect(canConnect(pin('record'), pin('list'))).toBe(false);
    expect(canConnect(pin('list'), pin('record'))).toBe(false);
    expect(canConnect(pin('text'), pin('record'))).toBe(false);
  });

  it('gives "Make record" one input pin per field', () => {
    const def = getNodeDef('data.makeRecord')!;
    const config = { fields: fields('name', 'email') };
    expect(inputPins(def, config).map((p) => [p.id, p.label])).toEqual([
      [fieldPinId('k0'), 'name'],
      [fieldPinId('k1'), 'email'],
    ]);
    expect(findPin(def, 'in', fieldPinId('k1'), config)?.label).toBe('email');
    expect(findPin(def, 'in', fieldPinId('k1'))).toBeUndefined();
    expect(inputPins(def, { fields: 'junk' })).toEqual([]);
  });
});

describe('record blocks', () => {
  it('makes a record from wired and typed-in values, then reads a field back', async () => {
    const { vars } = await run(
      [
        n('name', 'data.text', { value: 'Ada' }),
        n('make', 'data.makeRecord', { fields: fields('name', 'age'), [fieldPinId('k1')]: '36' }),
        n('set', 'action.setVariable', { variable: 'person' }),
        n('get', 'data.getField', { field: 'Age' }),
        n('setAge', 'action.setVariable', { variable: 'age' }),
      ],
      [
        ex('start', 'set'),
        ex('set', 'setAge'),
        da('name', 'value', 'make', fieldPinId('k0')),
        da('make', 'value', 'set', 'value'),
        da('make', 'value', 'get', 'record'),
        da('get', 'value', 'setAge', 'value'),
      ],
    );
    expect(vars.person).toEqual({ name: 'Ada', age: '36' });
    expect(vars.age).toBe('36');
  });

  it('reports whether a field exists', async () => {
    const { toasts } = await run(
      [
        n('get', 'data.getVariable', { variable: 'p' }),
        n('has', 'data.getField', { field: 'phone' }),
        n('val', 'data.getField', { field: 'name' }),
        n('t1', 'action.toast'),
        n('t2', 'action.toast'),
        n('t3', 'action.toast'),
      ],
      [
        ex('start', 't1'),
        ex('t1', 't2'),
        ex('t2', 't3'),
        da('get', 'value', 'has', 'record'),
        da('get', 'value', 'val', 'record'),
        da('has', 'found', 't1', 'message'),
        da('has', 'value', 't2', 'message'),
        da('val', 'value', 't3', 'message'),
      ],
      { p: { name: 'Ada' } },
    );
    expect(toasts).toEqual(['false', '', 'Ada']);
  });

  it('“Change field” returns a changed copy and leaves the original alone', async () => {
    const original = { name: 'Ada', age: 36 };
    const { vars } = await run(
      [
        n('get', 'data.getVariable', { variable: 'p' }),
        n('rename', 'data.setField', { field: 'NAME', value: 'Grace' }),
        n('add', 'data.setField', { field: 'city', value: 'London' }),
        n('set', 'action.setVariable', { variable: 'q' }),
      ],
      [
        ex('start', 'set'),
        da('get', 'value', 'rename', 'record'),
        da('rename', 'value', 'add', 'record'),
        da('add', 'value', 'set', 'value'),
      ],
      { p: original },
    );
    expect(vars.q).toEqual({ name: 'Grace', age: 36, city: 'London' });
    expect(original).toEqual({ name: 'Ada', age: 36 });
  });

  it('“Set field of variable” updates one field of a record variable', async () => {
    const { vars } = await run(
      [
        n('a', 'action.setVariableField', { variable: 'p', field: 'age', value: '37' }),
        n('b', 'action.setVariableField', { variable: 'p', field: 'email', value: 'ada@example.com' }),
      ],
      [ex('start', 'a'), ex('a', 'b')],
      { p: { name: 'Ada', age: 36 } },
    );
    expect(vars.p).toEqual({ name: 'Ada', age: '37', email: 'ada@example.com' });
  });

  it('starts from an empty record when the variable holds something else', async () => {
    const { vars } = await run(
      [n('a', 'action.setVariableField', { variable: 'p', field: 'x', value: 1 })],
      [ex('start', 'a')],
      { p: 'not a record' },
    );
    expect(vars.p).toEqual({ x: 1 });
  });

  it('builds a list of records and loops over it', async () => {
    const { toasts } = await run(
      [
        n('make', 'data.makeRecord', { fields: fields('name'), [fieldPinId('k0')]: 'Ada' }),
        n('add1', 'action.addToList', { variable: 'people' }),
        n('make2', 'data.makeRecord', { fields: fields('name'), [fieldPinId('k0')]: 'Bo' }),
        n('add2', 'action.addToList', { variable: 'people' }),
        n('list', 'data.getVariable', { variable: 'people' }),
        n('each', 'flow.forEach'),
        n('field', 'data.getField', { field: 'name' }),
        n('say', 'action.toast'),
      ],
      [
        ex('start', 'add1'),
        ex('add1', 'add2'),
        ex('add2', 'each'),
        ex('each', 'say', 'body'),
        da('make', 'value', 'add1', 'item'),
        da('make2', 'value', 'add2', 'item'),
        da('list', 'value', 'each', 'list'),
        da('each', 'item', 'field', 'record'),
        da('field', 'value', 'say', 'message'),
      ],
      { people: [] },
    );
    expect(toasts).toEqual(['Ada', 'Bo']);
  });

  it('“A is empty” is true for a record with no fields', async () => {
    const { toasts } = await run(
      [n('get', 'data.getVariable', { variable: 'p' }), n('cmp', 'data.compare', { op: 'empty' }), n('t', 'action.toast')],
      [ex('start', 't'), da('get', 'value', 'cmp', 'a'), da('cmp', 'value', 't', 'message')],
      { p: {} },
    );
    expect(toasts).toEqual(['true']);
  });

  it('explains badly set-up record blocks', async () => {
    const errorFor = async (nodes: GraphNode[], edges: GraphEdge[]) => {
      const h = makeHost({ p: {} });
      const graph: LogicGraph = { nodes: [n('start', 'event.screenLoad', { screen: 's' }), ...nodes], edges };
      return new Interpreter(graph, h.host).runEvent('start').then(
        () => null,
        (e: GraphError) => e.message,
      );
    };
    expect(
      await errorFor(
        [n('make', 'data.makeRecord', { fields: fields('name', 'Name') }), n('t', 'action.toast')],
        [ex('start', 't'), da('make', 'value', 't', 'message')],
      ),
    ).toBe('Two fields in this “Make record” block are called “Name”.');
    expect(
      await errorFor(
        [n('make', 'data.makeRecord', { fields: fields(' ') }), n('t', 'action.toast')],
        [ex('start', 't'), da('make', 'value', 't', 'message')],
      ),
    ).toMatch(/has no name/);
    expect(await errorFor([n('a', 'action.setVariableField', { field: 'x' })], [ex('start', 'a')])).toMatch(
      /no record variable picked/,
    );
    expect(
      await errorFor([n('a', 'action.setVariableField', { variable: 'p', field: '' })], [ex('start', 'a')]),
    ).toBe('Type the name of the field to set.');
  });
});
