// List blocks: find, sort, filter and join lists, and change list variables.
// Positions count from 1, like the other list blocks. For lists of records,
// a "Field" picks which field of each item to look at.

import { checkValues, compareForSort, itemField, looseEquals, toList, toNumber, toText } from '../convert';
import { execIn, execOut, type NodeDef, type Pin } from '../types';

const quote = (v: unknown, fallback = '…') => {
  const t = toText(v);
  return t === '' ? fallback : `“${t}”`;
};
const pick = (name: string | undefined, fallback: string) => (name ? `“${name}”` : fallback);

const listIn: Pin = { id: 'list', label: 'List', kind: 'data', valueType: 'list' };
const fieldIn: Pin = {
  id: 'field',
  label: 'Field (for records)',
  kind: 'data',
  valueType: 'text',
  inline: { type: 'text', default: '' },
};
const positionIn = (fallback: number): Pin => ({
  id: 'index',
  label: 'Position',
  kind: 'data',
  valueType: 'number',
  inline: { type: 'number', default: fallback },
});

/** "by “name”" when a field is set, so sentences read naturally for records. */
const byField = (c: Record<string, unknown>) => (toText(c.field).trim() ? ` by ${quote(c.field)}` : '');

export const FILTER_CHECKS: { value: string; label: string; sentence: string; needsValue: boolean }[] = [
  { value: '=', label: 'equals', sentence: '=', needsValue: true },
  { value: '!=', label: 'is not', sentence: '≠', needsValue: true },
  { value: '>', label: 'is bigger than', sentence: '>', needsValue: true },
  { value: '<', label: 'is smaller than', sentence: '<', needsValue: true },
  { value: 'contains', label: 'contains', sentence: 'contains', needsValue: true },
  { value: 'notEmpty', label: 'is not empty', sentence: 'is not empty', needsValue: false },
  { value: 'empty', label: 'is empty', sentence: 'is empty', needsValue: false },
];
const filterCheck = (op: unknown) => FILTER_CHECKS.find((c) => c.value === op) ?? FILTER_CHECKS[0];

/** A position from 1 to `max`, or null when it is outside the list. */
function position(raw: unknown, max: number): number | null {
  const pos = Math.round(toNumber(raw));
  return pos >= 1 && pos <= max ? pos : null;
}

export const listNodes: NodeDef[] = [
  {
    type: 'list.find',
    category: 'lists',
    label: 'Find in list',
    description: 'Finds the first item that matches a value, and tells you its position (0 if it is not there).',
    inputs: [
      listIn,
      { id: 'value', label: 'Look for', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
      fieldIn,
    ],
    outputs: [
      { id: 'index', label: 'Position', kind: 'data', valueType: 'number' },
      { id: 'found', label: 'Was found', kind: 'data', valueType: 'boolean' },
      { id: 'item', label: 'Item', kind: 'data', valueType: 'any' },
    ],
    configFields: [],
    sentence: (c) =>
      toText(c.field).trim()
        ? `Find the item whose ${quote(c.field)} is ${quote(c.value)}`
        : `Find ${quote(c.value)} in a list`,
    async evaluate(ctx) {
      const list = toList(await ctx.input('list'));
      const want = await ctx.input('value');
      const field = toText(await ctx.input('field'));
      const i = list.findIndex((item) => looseEquals(itemField(item, field), want));
      return { index: i + 1, found: i >= 0, item: i >= 0 ? list[i] : '' };
    },
  },
  {
    type: 'list.sort',
    category: 'lists',
    label: 'Sort list',
    description: 'Puts a list in order: numbers by size, text from A to Z. Gives you a sorted copy.',
    inputs: [listIn, fieldIn],
    outputs: [{ id: 'value', label: 'Sorted list', kind: 'data', valueType: 'list' }],
    configFields: [
      {
        key: 'order',
        label: 'Order',
        type: 'select',
        default: 'asc',
        options: [
          { value: 'asc', label: 'A → Z, smallest first' },
          { value: 'desc', label: 'Z → A, biggest first' },
        ],
      },
    ],
    sentence: (c) => `Sort list${byField(c)}, ${c.order === 'desc' ? 'Z → A' : 'A → Z'}`,
    async evaluate(ctx) {
      const list = [...toList(await ctx.input('list'))];
      const field = toText(await ctx.input('field'));
      const dir = ctx.config.order === 'desc' ? -1 : 1;
      // Array.prototype.sort is stable, so equal items keep their order.
      list.sort((a, b) => dir * compareForSort(itemField(a, field), itemField(b, field)));
      return { value: list };
    },
  },
  {
    type: 'list.filter',
    category: 'lists',
    label: 'Filter list',
    description: 'Keeps only the items that pass a check, such as “age is bigger than 18”. Gives you a new list.',
    inputs: [listIn, fieldIn],
    // "is empty" checks have nothing to compare with, so they get no Value input.
    dynamicInputs: (c) =>
      filterCheck(c.op).needsValue
        ? [{ id: 'value', label: 'Value', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } }]
        : [],
    outputs: [
      { id: 'value', label: 'Matching items', kind: 'data', valueType: 'list' },
      { id: 'count', label: 'How many', kind: 'data', valueType: 'number' },
    ],
    configFields: [
      {
        key: 'op',
        label: 'Keep items that',
        type: 'select',
        default: '=',
        options: FILTER_CHECKS.map(({ value, label }) => ({ value, label })),
      },
    ],
    sentence: (c) => {
      const check = filterCheck(c.op);
      const what = toText(c.field).trim() ? quote(c.field) : 'item';
      return `Keep items where ${what} ${check.sentence}${check.needsValue ? ` ${quote(c.value)}` : ''}`;
    },
    async evaluate(ctx) {
      const list = toList(await ctx.input('list'));
      const field = toText(await ctx.input('field'));
      const check = filterCheck(ctx.config.op);
      const want = check.needsValue ? await ctx.input('value') : '';
      const kept = list.filter((item) => checkValues(check.value, itemField(item, field), want));
      return { value: kept, count: kept.length };
    },
  },
  {
    type: 'list.join',
    category: 'lists',
    label: 'Join list into text',
    description: 'Turns a list into one piece of text, with a separator between the items.',
    inputs: [
      listIn,
      { id: 'separator', label: 'Between items', kind: 'data', valueType: 'text', inline: { type: 'text', default: ', ' } },
      fieldIn,
    ],
    outputs: [{ id: 'value', label: 'Text', kind: 'data', valueType: 'text' }],
    configFields: [],
    sentence: (c) => `Join items${byField(c)} with ${quote(c.separator ?? ', ', 'nothing')}`,
    async evaluate(ctx) {
      const list = toList(await ctx.input('list'));
      const field = toText(await ctx.input('field'));
      const sep = toText(await ctx.input('separator'));
      return { value: list.map((item) => toText(itemField(item, field))).join(sep) };
    },
  },
  {
    type: 'action.insertInList',
    category: 'actions',
    label: 'Insert into list',
    description: 'Puts an item into a list variable at a position (1 puts it first). Later items move down.',
    inputs: [
      execIn,
      { id: 'item', label: 'Item', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
      positionIn(1),
    ],
    outputs: [execOut],
    configFields: [{ key: 'variable', label: 'List', type: 'variable', variableTypes: ['list'] }],
    sentence: (c, n) => `Insert item into ${pick(n.variable(c.variable), 'a list')}`,
    validate: (c) => (c.variable ? null : 'This “Insert into list” block has no list picked.'),
    async execute(ctx) {
      const id = String(ctx.config.variable);
      const list = [...toList(ctx.host.getVar(id))];
      const item = await ctx.input('item');
      // Positions past the end add to the end; 0 or less puts the item first.
      const pos = Math.min(Math.max(Math.round(toNumber(await ctx.input('index'))), 1), list.length + 1);
      list.splice(pos - 1, 0, item);
      ctx.host.setVar(id, list);
    },
  },
  {
    type: 'action.setListItem',
    category: 'actions',
    label: 'Change item in list',
    description: 'Replaces the item at a position in a list variable (1 is the first item).',
    inputs: [
      execIn,
      positionIn(1),
      { id: 'item', label: 'New item', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
    ],
    outputs: [execOut],
    configFields: [{ key: 'variable', label: 'List', type: 'variable', variableTypes: ['list'] }],
    sentence: (c, n) => `Change an item in ${pick(n.variable(c.variable), 'a list')}`,
    validate: (c) => (c.variable ? null : 'This “Change item in list” block has no list picked.'),
    async execute(ctx) {
      const id = String(ctx.config.variable);
      const list = [...toList(ctx.host.getVar(id))];
      const pos = position(await ctx.input('index'), list.length);
      // Like "Remove from list", a position outside the list changes nothing.
      if (pos === null) return;
      list[pos - 1] = await ctx.input('item');
      ctx.host.setVar(id, list);
    },
  },
];
