import { checkValues, toBool, toList, toNumber, toText } from '../convert';
import type { NodeDef } from '../types';

const pick = (name: string | undefined, fallback: string) => (name ? `“${name}”` : fallback);

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
    description: 'Reads what is typed into a text box, the choice picked in a dropdown, or whether a checkbox is ticked.',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', kind: 'data', valueType: 'any' }],
    configFields: [
      { key: 'element', label: 'Text box / checkbox / dropdown', type: 'element', elementTypes: ['input', 'checkbox', 'dropdown'] },
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
    description: 'Adds, subtracts, multiplies or divides two numbers.',
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
        ],
      },
    ],
    sentence: (c) => `A ${({ '+': '+', '-': '−', '*': '×', '/': '÷' } as Record<string, string>)[String(c.op ?? '+')]} B`,
    async evaluate(ctx) {
      const a = toNumber(await ctx.input('a'));
      const b = toNumber(await ctx.input('b'));
      switch (ctx.config.op ?? '+') {
        case '-':
          return { value: a - b };
        case '*':
          return { value: a * b };
        case '/':
          return { value: b === 0 ? 0 : a / b };
        default:
          return { value: a + b };
      }
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
