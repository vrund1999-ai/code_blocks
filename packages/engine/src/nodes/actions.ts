import { toBool, toList, toNumber, toText } from '../convert';
import { execIn, execOut, type NodeDef, type Pin } from '../types';

const pick = (name: string | undefined, fallback: string) => (name ? `“${name}”` : fallback);
const flow: Pin[] = [execIn];

export const actionNodes: NodeDef[] = [
  {
    type: 'action.setText',
    category: 'actions',
    label: 'Set text',
    description: 'Changes the text shown on a Text, Button or Checkbox.',
    inputs: [
      ...flow,
      { id: 'text', label: 'Text', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
    ],
    outputs: [execOut],
    configFields: [
      { key: 'element', label: 'Element', type: 'element', elementTypes: ['text', 'button', 'checkbox'] },
    ],
    sentence: (c, n) => `Set text of ${pick(n.element(c.element), '…')}`,
    validate: (c) => (c.element ? null : 'This “Set text” block has no element picked.'),
    async execute(ctx) {
      const text = toText(await ctx.input('text'));
      // The host maps "text" to the right prop (e.g. a button's label).
      ctx.host.setElementProp(String(ctx.config.element), 'text', text);
    },
  },
  {
    type: 'action.setInputValue',
    category: 'actions',
    label: 'Set text box value',
    description: 'Puts text into a text box, or picks a choice in a dropdown (use an empty value to clear it).',
    inputs: [
      ...flow,
      { id: 'value', label: 'Value', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
    ],
    outputs: [execOut],
    configFields: [{ key: 'element', label: 'Text box / dropdown', type: 'element', elementTypes: ['input', 'dropdown'] }],
    sentence: (c, n) => `Set value of ${pick(n.element(c.element), '…')}`,
    validate: (c) => (c.element ? null : 'This block has no text box picked.'),
    async execute(ctx) {
      ctx.host.setElementProp(String(ctx.config.element), 'value', toText(await ctx.input('value')));
    },
  },
  {
    type: 'action.setVisible',
    category: 'actions',
    label: 'Show / hide',
    description: 'Shows or hides any element.',
    inputs: [
      ...flow,
      { id: 'visible', label: 'Visible', kind: 'data', valueType: 'boolean', inline: { type: 'boolean', default: true } },
    ],
    outputs: [execOut],
    configFields: [{ key: 'element', label: 'Element', type: 'element' }],
    sentence: (c, n) => `Show or hide ${pick(n.element(c.element), '…')}`,
    validate: (c) => (c.element ? null : 'This “Show / hide” block has no element picked.'),
    async execute(ctx) {
      ctx.host.setElementProp(String(ctx.config.element), 'visible', toBool(await ctx.input('visible')));
    },
  },
  {
    type: 'action.setVariable',
    category: 'actions',
    label: 'Set variable',
    description: 'Stores a value in a variable.',
    inputs: [
      ...flow,
      { id: 'value', label: 'Value', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
    ],
    outputs: [execOut],
    configFields: [{ key: 'variable', label: 'Variable', type: 'variable' }],
    sentence: (c, n) => `Set ${pick(n.variable(c.variable), 'a variable')}`,
    validate: (c) => (c.variable ? null : 'This “Set variable” block has no variable picked.'),
    async execute(ctx) {
      ctx.host.setVar(String(ctx.config.variable), await ctx.input('value'));
    },
  },
  {
    type: 'action.changeVariable',
    category: 'actions',
    label: 'Change number by',
    description: 'Adds an amount to a number variable (use a negative number to subtract).',
    inputs: [
      ...flow,
      { id: 'amount', label: 'Amount', kind: 'data', valueType: 'number', inline: { type: 'number', default: 1 } },
    ],
    outputs: [execOut],
    configFields: [{ key: 'variable', label: 'Variable', type: 'variable', variableTypes: ['number'] }],
    sentence: (c, n) => `Change ${pick(n.variable(c.variable), 'a variable')} by`,
    validate: (c) => (c.variable ? null : 'This block has no variable picked.'),
    async execute(ctx) {
      const id = String(ctx.config.variable);
      ctx.host.setVar(id, toNumber(ctx.host.getVar(id)) + toNumber(await ctx.input('amount')));
    },
  },
  {
    type: 'action.addToList',
    category: 'actions',
    label: 'Add to list',
    description: 'Adds an item to the end of a list variable.',
    inputs: [
      ...flow,
      { id: 'item', label: 'Item', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
    ],
    outputs: [execOut],
    configFields: [{ key: 'variable', label: 'List', type: 'variable', variableTypes: ['list'] }],
    sentence: (c, n) => `Add item to ${pick(n.variable(c.variable), 'a list')}`,
    validate: (c) => (c.variable ? null : 'This “Add to list” block has no list picked.'),
    async execute(ctx) {
      const id = String(ctx.config.variable);
      const item = await ctx.input('item');
      ctx.host.setVar(id, [...toList(ctx.host.getVar(id)), item]);
    },
  },
  {
    type: 'action.removeFromList',
    category: 'actions',
    label: 'Remove from list',
    description: 'Removes the item at a position (1 is the first item).',
    inputs: [
      ...flow,
      { id: 'index', label: 'Position', kind: 'data', valueType: 'number', inline: { type: 'number', default: 1 } },
    ],
    outputs: [execOut],
    configFields: [{ key: 'variable', label: 'List', type: 'variable', variableTypes: ['list'] }],
    sentence: (c, n) => `Remove item from ${pick(n.variable(c.variable), 'a list')}`,
    validate: (c) => (c.variable ? null : 'This “Remove from list” block has no list picked.'),
    async execute(ctx) {
      const id = String(ctx.config.variable);
      const pos = Math.round(toNumber(await ctx.input('index')));
      const list = [...toList(ctx.host.getVar(id))];
      if (pos >= 1 && pos <= list.length) list.splice(pos - 1, 1);
      ctx.host.setVar(id, list);
    },
  },
  {
    type: 'action.toast',
    category: 'actions',
    label: 'Show message',
    description: 'Pops up a short message.',
    inputs: [
      ...flow,
      { id: 'message', label: 'Message', kind: 'data', valueType: 'text', inline: { type: 'text', default: 'Hello!' } },
    ],
    outputs: [execOut],
    configFields: [],
    sentence: () => 'Show a message',
    async execute(ctx) {
      ctx.host.toast(toText(await ctx.input('message')));
    },
  },
  {
    type: 'action.goToScreen',
    category: 'actions',
    label: 'Go to screen',
    description: 'Switches to another screen.',
    inputs: [...flow],
    outputs: [execOut],
    configFields: [{ key: 'screen', label: 'Screen', type: 'screen' }],
    sentence: (c, n) => `Go to ${pick(n.screen(c.screen), 'a screen')}`,
    validate: (c) => (c.screen ? null : 'This “Go to screen” block has no screen picked.'),
    execute(ctx) {
      ctx.host.navigate(String(ctx.config.screen));
    },
  },
  {
    type: 'action.wait',
    category: 'actions',
    label: 'Wait',
    description: 'Pauses for a number of seconds before continuing.',
    inputs: [
      ...flow,
      { id: 'seconds', label: 'Seconds', kind: 'data', valueType: 'number', inline: { type: 'number', default: 1 } },
    ],
    outputs: [execOut],
    configFields: [],
    sentence: () => 'Wait',
    async execute(ctx) {
      await ctx.host.sleep(Math.max(0, toNumber(await ctx.input('seconds'))) * 1000);
    },
  },
  {
    type: 'action.saveStorage',
    category: 'actions',
    label: 'Save to device',
    description: 'Remembers a value on this device, even after closing the app.',
    inputs: [
      ...flow,
      { id: 'value', label: 'Value', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
    ],
    outputs: [execOut],
    configFields: [{ key: 'key', label: 'Save as (name)', type: 'text', default: 'my-data' }],
    sentence: (c) => `Save as “${c.key || '…'}”`,
    validate: (c) => (c.key ? null : 'Give the saved value a name.'),
    async execute(ctx) {
      ctx.host.storageSet(String(ctx.config.key), await ctx.input('value'));
    },
  },
  {
    type: 'action.loadStorage',
    category: 'actions',
    label: 'Load from device',
    description: 'Reads a value saved earlier with “Save to device”.',
    inputs: [...flow],
    outputs: [
      execOut,
      { id: 'value', label: 'Value', kind: 'data', valueType: 'any' },
      { id: 'found', label: 'Was found', kind: 'data', valueType: 'boolean' },
    ],
    configFields: [{ key: 'key', label: 'Saved name', type: 'text', default: 'my-data' }],
    sentence: (c) => `Load “${c.key || '…'}”`,
    validate: (c) => (c.key ? null : 'Enter the name the value was saved as.'),
    execute(ctx) {
      const value = ctx.host.storageGet(String(ctx.config.key));
      ctx.setOutputs({ value: value ?? '', found: value !== undefined && value !== null });
    },
  },
];
