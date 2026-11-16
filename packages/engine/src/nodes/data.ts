import { checkValues, toBool, toList, toNumber, toText } from '../convert';
import type { NodeDef } from '../types';

const pick = (name: string | undefined, fallback: string) => (name ? `“${name}”` : fallback);

const MATH_SENTENCES: Record<string, string> = {
  '+': 'A + B',
  '-': 'A − B',
  '*': 'A × B',
  '/': 'A ÷ B',
  '%': 'Remainder of A ÷ B',
  min: 'Smaller of A and B',
  max: 'Bigger of A and B',
};

/** The *Math* block's operations. Dividing by zero gives 0, as does its remainder. */
export function calculate(op: string, a: number, b: number): number {
  switch (op) {
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? 0 : a / b;
    case '%':
      return b === 0 ? 0 : a % b;
    case 'min':
      return Math.min(a, b);
    case 'max':
      return Math.max(a, b);
    default:
      return a + b;
  }
}

/** The most decimal places *Round number* keeps. */
export const MAX_PLACES = 10;

/**
 * Rounds to whole numbers or to `places` decimal places (0 to MAX_PLACES).
 * Halves round away from zero, as people expect (2.5 → 3, −2.5 → −3), and
 * numbers like 1.005 round as written (to 1.01), not as stored.
 */
export function roundNumber(value: number, places: number, mode: 'nearest' | 'down' | 'up'): number {
  if (!Number.isFinite(value)) return value;
  const p = Math.min(MAX_PLACES, Math.max(0, Math.round(places) || 0));
  const fn = mode === 'down' ? Math.floor : mode === 'up' ? Math.ceil : (x: number) => Math.sign(x) * Math.round(Math.abs(x));
  // Shifting the decimal point in the number's text avoids errors like 1.005 × 100 = 100.49999…
  // Very large or small numbers are already written with an exponent, so they're shifted by multiplying.
  let result = Number(`${fn(Number(`${value}e${p}`))}e-${p}`);
  if (!Number.isFinite(result)) result = fn(value * 10 ** p) / 10 ** p;
  return Object.is(result, -0) ? 0 : result;
}

export const dataNodes: NodeDef[] = [
  {
    type: 'data.text',
    category: 'data',
    label: 'Text',
    description: 'A fixed piece of text.',
    inputs: [],
    outputs: [{ id: 'value', label: 'Text', kind: 'data', valueType: 'text' }],
    configFields: [{ key: 'value', label: 'Text', type: 'text', default: '' }],
    sentence: (c) => `“${toText(c.value)}”`,
    evaluate: (ctx) => ({ value: toText(ctx.config.value) }),
  },
  {
    type: 'data.number',
    category: 'data',
    label: 'Number',
    description: 'A fixed number.',
    inputs: [],
    outputs: [{ id: 'value', label: 'Number', kind: 'data', valueType: 'number' }],
    configFields: [{ key: 'value', label: 'Number', type: 'number', default: 0 }],
    sentence: (c) => toText(c.value ?? 0),
    evaluate: (ctx) => ({ value: toNumber(ctx.config.value) }),
  },
  {
    type: 'data.boolean',
    category: 'data',
    label: 'Yes / No',
    description: 'A fixed true (yes) or false (no) value.',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', kind: 'data', valueType: 'boolean' }],
    configFields: [{ key: 'value', label: 'Yes?', type: 'boolean', default: true }],
    sentence: (c) => (toBool(c.value) ? 'Yes (true)' : 'No (false)'),
    evaluate: (ctx) => ({ value: toBool(ctx.config.value) }),
  },
  {
    type: 'data.getVariable',
    category: 'data',
    label: 'Get variable',
    description: 'Reads the current value of a variable.',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', kind: 'data', valueType: 'any' }],
    configFields: [{ key: 'variable', label: 'Variable', type: 'variable' }],
    sentence: (c, n) => pick(n.variable(c.variable), 'Pick a variable'),
    validate: (c) => (c.variable ? null : 'This “Get variable” block has no variable picked.'),
    evaluate: (ctx) => ({ value: ctx.host.getVar(String(ctx.config.variable)) }),
  },
  {
    type: 'data.getInputValue',
    category: 'data',
    label: 'Get text box value',
    description: 'Reads what is typed into a text box or number box, the choice picked in a dropdown, a slider’s number, the date picked, or whether a checkbox is ticked.',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', kind: 'data', valueType: 'any' }],
    configFields: [
      { key: 'element', label: 'Input', type: 'element', elementTypes: ['input', 'checkbox', 'dropdown', 'number', 'slider', 'date'] },
    ],
    sentence: (c, n) => `Value of ${pick(n.element(c.element), '…')}`,
    validate: (c) => (c.element ? null : 'This block has no text box picked.'),
    evaluate: (ctx) => ({ value: ctx.host.getElementValue(String(ctx.config.element)) }),
  },
  {
    type: 'data.join',
    category: 'text',
    label: 'Join text',
    description: 'Puts two pieces of text together.',
    inputs: [
      { id: 'a', label: 'First', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
      { id: 'b', label: 'Second', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
    ],
    outputs: [{ id: 'value', label: 'Result', kind: 'data', valueType: 'text' }],
    configFields: [],
    sentence: () => 'First + Second',
    async evaluate(ctx) {
      return { value: toText(await ctx.input('a')) + toText(await ctx.input('b')) };
    },
  },
  {
    type: 'data.math',
    category: 'data',
    label: 'Math',
    description: 'Adds, subtracts, multiplies or divides two numbers, or gives the remainder, the smaller or the bigger of them.',
    inputs: [
      { id: 'a', label: 'A', kind: 'data', valueType: 'number', inline: { type: 'number', default: 0 } },
      { id: 'b', label: 'B', kind: 'data', valueType: 'number', inline: { type: 'number', default: 0 } },
    ],
    outputs: [{ id: 'value', label: 'Result', kind: 'data', valueType: 'number' }],
    configFields: [
      {
        key: 'op',
        label: 'Operation',
        type: 'select',
        default: '+',
        options: [
          { value: '+', label: '+ add' },
          { value: '-', label: '− subtract' },
          { value: '*', label: '× multiply' },
          { value: '/', label: '÷ divide' },
          { value: '%', label: 'remainder of A ÷ B' },
          { value: 'min', label: 'smaller of A and B' },
          { value: 'max', label: 'bigger of A and B' },
        ],
      },
    ],
    sentence: (c) => MATH_SENTENCES[String(c.op ?? '+')] ?? 'A + B',
    async evaluate(ctx) {
      const a = toNumber(await ctx.input('a'));
      const b = toNumber(await ctx.input('b'));
      return { value: calculate(String(ctx.config.op ?? '+'), a, b) };
    },
  },
  {
    type: 'data.round',
    category: 'data',
    label: 'Round number',
    description: 'Rounds a number to a whole number, or to some decimal places: to the nearest, down or up.',
    inputs: [
      { id: 'a', label: 'Number', kind: 'data', valueType: 'number', inline: { type: 'number', default: 0 } },
      { id: 'places', label: 'Decimal places', kind: 'data', valueType: 'number', inline: { type: 'number', default: 0 } },
    ],
    outputs: [{ id: 'value', label: 'Result', kind: 'data', valueType: 'number' }],
    configFields: [
      {
        key: 'mode',
        label: 'Round',
        type: 'select',
        default: 'nearest',
        options: [
          { value: 'nearest', label: 'to the nearest' },
          { value: 'down', label: 'down' },
          { value: 'up', label: 'up' },
        ],
      },
    ],
    sentence: (c) => ({ down: 'Round down', up: 'Round up' } as Record<string, string>)[String(c.mode)] ?? 'Round to the nearest',
    async evaluate(ctx) {
      const a = toNumber(await ctx.input('a'));
      const places = toNumber(await ctx.input('places'));
      return { value: roundNumber(a, places, ctx.config.mode === 'down' || ctx.config.mode === 'up' ? ctx.config.mode : 'nearest') };
    },
  },
  {
    type: 'data.compare',
    category: 'data',
    label: 'Compare',
    description: 'Checks whether two values are equal, or which is bigger.',
    inputs: [
      { id: 'a', label: 'A', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
      { id: 'b', label: 'B', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
    ],
    outputs: [{ id: 'value', label: 'Is true', kind: 'data', valueType: 'boolean' }],
    configFields: [
      {
        key: 'op',
        label: 'Check',
        type: 'select',
        default: '=',
        options: [
          { value: '=', label: 'A equals B' },
          { value: '!=', label: 'A is not B' },
          { value: '>', label: 'A is bigger than B' },
          { value: '<', label: 'A is smaller than B' },
          { value: 'empty', label: 'A is empty' },
        ],
      },
    ],
    sentence: (c) =>
      ({ '=': 'A = B', '!=': 'A ≠ B', '>': 'A > B', '<': 'A < B', empty: 'A is empty' } as Record<string, string>)[
        String(c.op ?? '=')
      ] ?? 'Compare',
    async evaluate(ctx) {
      const a = await ctx.input('a');
      const op = String(ctx.config.op ?? '=');
      const b = op === 'empty' ? '' : await ctx.input('b');
      return { value: checkValues(op, a, b) };
    },
  },
  {
    type: 'data.logic',
    category: 'data',
    label: 'And / Or',
    description: 'Combines two yes/no values.',
    inputs: [
      { id: 'a', label: 'A', kind: 'data', valueType: 'boolean', inline: { type: 'boolean', default: true } },
      { id: 'b', label: 'B', kind: 'data', valueType: 'boolean', inline: { type: 'boolean', default: true } },
    ],
    outputs: [{ id: 'value', label: 'Result', kind: 'data', valueType: 'boolean' }],
    configFields: [
      {
        key: 'op',
        label: 'Combine with',
        type: 'select',
        default: 'and',
        options: [
          { value: 'and', label: 'Both are true (AND)' },
          { value: 'or', label: 'Either is true (OR)' },
        ],
      },
    ],
    sentence: (c) => (c.op === 'or' ? 'A or B' : 'A and B'),
    async evaluate(ctx) {
      const a = toBool(await ctx.input('a'));
      const b = toBool(await ctx.input('b'));
      return { value: ctx.config.op === 'or' ? a || b : a && b };
    },
  },
  {
    type: 'data.not',
    category: 'data',
    label: 'Not',
    description: 'Flips yes to no and no to yes.',
    inputs: [{ id: 'a', label: 'Value', kind: 'data', valueType: 'boolean', inline: { type: 'boolean', default: true } }],
    outputs: [{ id: 'value', label: 'Opposite', kind: 'data', valueType: 'boolean' }],
    configFields: [],
    sentence: () => 'Not',
    async evaluate(ctx) {
      return { value: !toBool(await ctx.input('a')) };
    },
  },
  {
    type: 'data.random',
    category: 'data',
    label: 'Random number',
    description: 'Picks a random whole number between two numbers.',
    inputs: [
      { id: 'min', label: 'From', kind: 'data', valueType: 'number', inline: { type: 'number', default: 1 } },
      { id: 'max', label: 'To', kind: 'data', valueType: 'number', inline: { type: 'number', default: 10 } },
    ],
    outputs: [{ id: 'value', label: 'Number', kind: 'data', valueType: 'number' }],
    configFields: [],
    sentence: () => 'Random number',
    async evaluate(ctx) {
      let min = Math.ceil(toNumber(await ctx.input('min')));
      let max = Math.floor(toNumber(await ctx.input('max')));
      if (min > max) [min, max] = [max, min];
      return { value: min + Math.floor(Math.random() * (max - min + 1)) };
    },
  },
  {
    type: 'data.listLength',
    category: 'lists',
    label: 'Count items',
    description: 'How many items are in a list.',
    inputs: [{ id: 'list', label: 'List', kind: 'data', valueType: 'list' }],
    outputs: [{ id: 'value', label: 'Count', kind: 'data', valueType: 'number' }],
    configFields: [],
    sentence: () => 'Number of items',
    async evaluate(ctx) {
      return { value: toList(await ctx.input('list')).length };
    },
  },
  {
    type: 'data.listItem',
    category: 'lists',
    label: 'Get item',
    description: 'Gets the item at a position in a list (1 is the first).',
    inputs: [
      { id: 'list', label: 'List', kind: 'data', valueType: 'list' },
      { id: 'index', label: 'Position', kind: 'data', valueType: 'number', inline: { type: 'number', default: 1 } },
    ],
    outputs: [{ id: 'value', label: 'Item', kind: 'data', valueType: 'any' }],
    configFields: [],
    sentence: () => 'Item at position',
    async evaluate(ctx) {
      const list = toList(await ctx.input('list'));
      const i = Math.round(toNumber(await ctx.input('index')));
      return { value: list[i - 1] ?? '' };
    },
  },
];
