import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, LogicGraph } from '../model/types';
import { checkValues, compareForSort, itemField } from './convert';
import { Interpreter } from './interpreter';
import { splitText, titleCase } from './nodes/text';
import { getNodeDef, inputPins, nodesInCategory } from './registry';
import type { HostApi } from './types';

function makeHost(vars: Record<string, unknown>) {
  const host: HostApi = {
    getVar: (id) => vars[id],
    setVar: (id, v) => {
      vars[id] = v;
    },
    getElementValue: () => '',
    setElementProp: () => {},
    toast: () => {},
    navigate: () => {},
    storageGet: () => undefined,
    storageSet: () => {},
    sleep: async () => {},
    httpRequest: async () => {
      throw new Error('offline');
    },
  };
  return host;
}

const node = (id: string, type: string, config: Record<string, unknown> = {}, y = 0): GraphNode => ({
  id,
  type,
  config,
  position: { x: 0, y },
});
const exec = (source: string, target: string): GraphEdge => ({
  id: `${source}->${target}`,
  source,
  sourcePin: 'next',
  target,
  targetPin: 'in',
  kind: 'exec',
});
const data = (source: string, sourcePin: string, target: string, targetPin: string): GraphEdge => ({
  id: `${source}.${sourcePin}->${target}.${targetPin}`,
  source,
  sourcePin,
  target,
  targetPin,
  kind: 'data',
});

/**
 * Evaluates one value block. `wired` values arrive through wires (from
 * variables); `config` holds settings and typed-in values.
 */
async function value(
  type: string,
  config: Record<string, unknown>,
  wired: Record<string, unknown> = {},
  outPin = 'value',
) {
  const vars: Record<string, unknown> = {};
  const nodes = [node('start', 'event.screenLoad', { screen: 's' }), node('block', type, config), node('save', 'action.setVariable', { variable: 'out' })];
  const edges = [exec('start', 'save'), data('block', outPin, 'save', 'value')];
  for (const [pin, v] of Object.entries(wired)) {
    vars[`in_${pin}`] = v;
    nodes.push(node(`get_${pin}`, 'data.getVariable', { variable: `in_${pin}` }));
    edges.push(data(`get_${pin}`, 'value', 'block', pin));
  }
  const graph: LogicGraph = { nodes, edges };
  await new Interpreter(graph, makeHost(vars)).runEvent('start');
  return vars.out;
}

/** Runs one action block on a list variable and returns the list afterwards. */
async function listAction(type: string, list: unknown[], config: Record<string, unknown>) {
  const vars: Record<string, unknown> = { items: list };
  const graph: LogicGraph = {
    nodes: [node('start', 'event.screenLoad', { screen: 's' }), node('act', type, { variable: 'items', ...config })],
    edges: [exec('start', 'act')],
  };
  await new Interpreter(graph, makeHost(vars)).runEvent('start');
  return vars.items;
}

const people = [
  { name: 'bo', age: 25 },
  { name: 'Ada', age: 36 },
  { name: 'Cy', age: 9 },
];

describe('text blocks', () => {
  it('changes case and trims', async () => {
    expect(await value('text.case', { op: 'upper', text: 'Hello' })).toBe('HELLO');
    expect(await value('text.case', { op: 'lower', text: 'Hello' })).toBe('hello');
    expect(await value('text.case', { op: 'title', text: 'ada LOVELACE-byron' })).toBe('Ada Lovelace-Byron');
    expect(await value('text.case', { op: 'trim', text: '  hi  ' })).toBe('hi');
    expect(titleCase('élodie o’neil')).toBe('Élodie O’neil');
  });

  it('checks contains / starts with / ends with, ignoring capitals unless asked', async () => {
    expect(await value('text.contains', { text: 'Hello World', part: 'world' })).toBe(true);
    expect(await value('text.contains', { text: 'Hello World', part: 'world', matchCase: true })).toBe(false);
    expect(await value('text.contains', { op: 'starts', text: 'Hello', part: 'he' })).toBe(true);
    expect(await value('text.contains', { op: 'ends', text: 'Hello', part: 'he' })).toBe(false);
    expect(await value('text.contains', { text: 'anything', part: '' })).toBe(true);
  });

  it('counts characters, including emoji as one', async () => {
    expect(await value('text.length', { text: 'Hi 👋' })).toBe(4);
    expect(await value('text.length', {}, { text: 42 })).toBe(2);
  });

  it('replaces every match and leaves text alone when there is nothing to find', async () => {
    expect(await value('text.replace', { text: 'a-b-c', find: '-', with: ' + ' })).toBe('a + b + c');
    expect(await value('text.replace', { text: 'a.b', find: '.', with: '' })).toBe('ab');
    expect(await value('text.replace', { text: 'abc', find: '' , with: 'x' })).toBe('abc');
  });

  it('splits text into a trimmed list', async () => {
    expect(await value('text.split', { text: 'red, green ,blue' })).toEqual(['red', 'green', 'blue']);
    expect(await value('text.split', { text: 'one two', separator: ' ' })).toEqual(['one', 'two']);
    expect(splitText('', ',')).toEqual([]);
    expect(splitText('abc', '')).toEqual(['a', 'b', 'c']);
    expect(splitText('a,,b', ',')).toEqual(['a', '', 'b']);
  });

  it('describes itself in plain English', () => {
    const names = { element: () => undefined, variable: () => undefined, screen: () => undefined, inList: () => false };
    expect(getNodeDef('text.replace')!.sentence!({ find: 'cat', with: '' }, names)).toBe('Replace “cat” with nothing');
    expect(getNodeDef('text.split')!.sentence!({}, names)).toBe('Split text at “,”');
    expect(getNodeDef('text.contains')!.sentence!({ op: 'starts', part: 'Dr' }, names)).toBe('Text starts with “Dr”');
  });
});

describe('list helpers', () => {
  it('reads a field of record items, or the item itself', () => {
    expect(itemField({ Name: 'Ada' }, 'name')).toBe('Ada');
    expect(itemField({ name: 'Ada' }, 'age')).toBe('');
    expect(itemField('plain', 'name')).toBe('');
    expect(itemField('plain', ' ')).toBe('plain');
  });

  it('sorts numbers by size and text alphabetically, empty values last', () => {
    const sorted = ['10', 'b', '', 9, 'A', '2'].sort(compareForSort);
    expect(sorted).toEqual(['2', 9, '10', 'A', 'b', '']);
    expect(['item 10', 'item 9'].sort(compareForSort)).toEqual(['item 9', 'item 10']);
  });

  it('runs the shared checks', () => {
    expect(checkValues('=', '5', 5)).toBe(true);
    expect(checkValues('contains', 'Hello', 'ELL')).toBe(true);
    expect(checkValues('notEmpty', [], '')).toBe(false);
    expect(checkValues('<', 3, '10')).toBe(true);
  });
});

describe('list blocks', () => {
  it('finds items by value or by a field', async () => {
    expect(await value('list.find', { value: 'b' }, { list: ['a', 'b', 'b'] }, 'index')).toBe(2);
    expect(await value('list.find', { value: '36', field: 'age' }, { list: people }, 'item')).toEqual(people[1]);
    expect(await value('list.find', { value: 'Zed', field: 'name' }, { list: people }, 'index')).toBe(0);
    expect(await value('list.find', { value: 'Zed', field: 'name' }, { list: people }, 'found')).toBe(false);
  });

  it('sorts a copy, by a field and in either direction', async () => {
    const list = [3, 1, 2];
    expect(await value('list.sort', {}, { list })).toEqual([1, 2, 3]);
    expect(list).toEqual([3, 1, 2]);
    const byName = (await value('list.sort', { field: 'name' }, { list: people })) as typeof people;
    expect(byName.map((p) => p.name)).toEqual(['Ada', 'bo', 'Cy']);
    const byAge = (await value('list.sort', { field: 'age', order: 'desc' }, { list: people })) as typeof people;
    expect(byAge.map((p) => p.age)).toEqual([36, 25, 9]);
  });

  it('filters items with a check', async () => {
    const adults = (await value('list.filter', { field: 'age', op: '>', value: 18 }, { list: people })) as typeof people;
    expect(adults.map((p) => p.name)).toEqual(['bo', 'Ada']);
    expect(await value('list.filter', { op: 'contains', value: 'an' }, { list: ['Banana', 'kiwi', 'MANGO'] })).toEqual([
      'Banana',
      'MANGO',
    ]);
    expect(await value('list.filter', { op: 'notEmpty' }, { list: ['a', '', ' ', 'b'] }, 'count')).toBe(2);
  });

  it('only gives Filter a Value input when the check needs one', () => {
    const def = getNodeDef('list.filter')!;
    expect(inputPins(def, { op: '=' }).map((p) => p.id)).toEqual(['list', 'field', 'value']);
    expect(inputPins(def, { op: 'empty' }).map((p) => p.id)).toEqual(['list', 'field']);
  });

  it('joins a list (or one field of each record) into text', async () => {
    expect(await value('list.join', {}, { list: ['a', 'b'] })).toBe('a, b');
    expect(await value('list.join', { separator: ' / ', field: 'name' }, { list: people })).toBe('bo / Ada / Cy');
  });

  it('inserts into a list variable, clamping the position', async () => {
    expect(await listAction('action.insertInList', ['a', 'b'], { item: 'x', index: 2 })).toEqual(['a', 'x', 'b']);
    expect(await listAction('action.insertInList', ['a'], { item: 'x', index: 1 })).toEqual(['x', 'a']);
    expect(await listAction('action.insertInList', ['a'], { item: 'x', index: 99 })).toEqual(['a', 'x']);
    expect(await listAction('action.insertInList', ['a'], { item: 'x', index: -3 })).toEqual(['x', 'a']);
    expect(await listAction('action.insertInList', [], { item: 'x' })).toEqual(['x']);
  });

  it('changes one item of a list variable, ignoring positions outside it', async () => {
    expect(await listAction('action.setListItem', ['a', 'b'], { index: 2, item: 'B' })).toEqual(['a', 'B']);
    expect(await listAction('action.setListItem', ['a'], { index: 5, item: 'B' })).toEqual(['a']);
  });
});

describe('palette groups', () => {
  it('puts text and list blocks in their own groups', () => {
    expect(nodesInCategory('text').map((d) => d.type)).toEqual([
      'data.join',
      'text.case',
      'text.contains',
      'text.length',
      'text.replace',
      'text.split',
    ]);
    expect(nodesInCategory('lists').map((d) => d.type)).toEqual([
      'data.listLength',
      'data.listItem',
      'list.find',
      'list.sort',
      'list.filter',
      'list.join',
      'data.makeRecord',
      'data.getField',
      'data.setField',
    ]);
  });
});
