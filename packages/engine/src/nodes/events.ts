import { execOut, type NodeDef } from '../types';

const pick = (name: string | undefined, fallback: string) => (name ? `“${name}”` : fallback);

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const DIGITS = '0123456789'.split('');

/** The keys *When key pressed* can listen to; `any` is every key. */
export const KEY_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: 'Any key' },
  { value: 'Enter', label: 'Enter' },
  { value: 'Space', label: 'Space' },
  { value: 'Escape', label: 'Escape' },
  { value: 'Backspace', label: 'Backspace' },
  { value: 'Tab', label: 'Tab' },
  { value: 'ArrowUp', label: 'Up arrow' },
  { value: 'ArrowDown', label: 'Down arrow' },
  { value: 'ArrowLeft', label: 'Left arrow' },
  { value: 'ArrowRight', label: 'Right arrow' },
  ...LETTERS.map((k) => ({ value: k, label: k.toUpperCase() })),
  ...DIGITS.map((k) => ({ value: k, label: k })),
];

/**
 * The name a key press goes by, from a browser's `KeyboardEvent.key`: letters
 * are lowercase (so Shift+A is still `a`), the space bar is `Space`, and other
 * keys keep their names, such as `Enter` and `ArrowUp`.
 */
export function keyName(key: string): string {
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (key === 'Esc') return 'Escape';
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Does a *When key pressed* block set to `wanted` listen to this key? */
export function keyMatches(wanted: unknown, name: string): boolean {
  return wanted === undefined || wanted === '' || wanted === 'any' || wanted === name;
}

const keyLabel = (key: unknown) => KEY_OPTIONS.find((o) => o.value === key)?.label ?? String(key);

// A button or element inside a List's cards also says which item its card shows.
const cardOutputs = (c: Record<string, unknown>, names: { inList(id: unknown): boolean }) =>
  names.inList(c.element)
    ? [
        { id: 'item', label: 'List item', kind: 'data' as const, valueType: 'any' as const },
        { id: 'index', label: 'Position', kind: 'data' as const, valueType: 'number' as const },
      ]
    : [];

export const eventNodes: NodeDef[] = [
  {
    type: 'event.screenLoad',
    category: 'events',
    label: 'When screen opens',
    description: 'Runs when a screen is shown (including when the app starts).',
    event: 'screenLoad',
    inputs: [],
    outputs: [execOut],
    configFields: [{ key: 'screen', label: 'Screen', type: 'screen' }],
    sentence: (c, n) => `When ${pick(n.screen(c.screen), 'a screen')} opens`,
    validate: (c) => (c.screen ? null : 'Pick which screen this listens to.'),
  },
  {
    type: 'event.click',
    category: 'events',
    label: 'When button clicked',
    description: 'Runs every time a button is clicked.',
    event: 'click',
    inputs: [],
    outputs: [execOut],
    dynamicOutputs: cardOutputs,
    configFields: [
      { key: 'element', label: 'Button', type: 'element', elementTypes: ['button'] },
    ],
    sentence: (c, n) => `When ${pick(n.element(c.element), 'a button')} is clicked`,
    validate: (c) => (c.element ? null : 'Pick which button this listens to.'),
  },
  {
    type: 'event.inputChange',
    category: 'events',
    label: 'When value changes',
    description: 'Runs when someone types in a text box or number box, ticks a checkbox, picks a dropdown choice or a date, or moves a slider.',
    event: 'change',
    inputs: [],
    outputs: [execOut, { id: 'value', label: 'New value', kind: 'data', valueType: 'any' }],
    configFields: [
      {
        key: 'element',
        label: 'Input',
        type: 'element',
        elementTypes: ['input', 'checkbox', 'dropdown', 'number', 'slider', 'date'],
      },
    ],
    sentence: (c, n) => `When ${pick(n.element(c.element), 'an input')} changes`,
    validate: (c) => (c.element ? null : 'Pick which input this listens to.'),
  },
  {
    type: 'event.listDelete',
    category: 'events',
    label: 'When list item deleted',
    description: 'Runs when the delete button next to a list item is clicked.',
    event: 'listDelete',
    inputs: [],
    outputs: [
      execOut,
      { id: 'index', label: 'Position', kind: 'data', valueType: 'number' },
      { id: 'item', label: 'Item', kind: 'data', valueType: 'any' },
    ],
    configFields: [{ key: 'element', label: 'List', type: 'element', elementTypes: ['list'] }],
    sentence: (c, n) => `When an item in ${pick(n.element(c.element), 'a list')} is deleted`,
    validate: (c) => (c.element ? null : 'Pick which list this listens to.'),
  },
  {
    type: 'event.cardClick',
    category: 'events',
    label: 'When list item clicked',
    description: 'Runs when someone clicks an item in a list, or its card. Clicking a button in the card runs that button’s blocks instead.',
    event: 'cardClick',
    inputs: [],
    outputs: [
      execOut,
      { id: 'index', label: 'Position', kind: 'data', valueType: 'number' },
      { id: 'item', label: 'Item', kind: 'data', valueType: 'any' },
    ],
    configFields: [{ key: 'element', label: 'List', type: 'element', elementTypes: ['list'] }],
    sentence: (c, n) => `When an item in ${pick(n.element(c.element), 'a list')} is clicked`,
    validate: (c) => (c.element ? null : 'Pick which list this listens to.'),
  },
  {
    type: 'event.keyPress',
    category: 'events',
    label: 'When key pressed',
    description:
      'Runs when someone presses a key while the app is running. While typing in a text box, only Enter and Escape count.',
    event: 'key',
    inputs: [],
    outputs: [execOut, { id: 'key', label: 'Key', kind: 'data', valueType: 'text' }],
    configFields: [{ key: 'key', label: 'Key', type: 'select', options: KEY_OPTIONS, default: 'any' }],
    sentence: (c) => (keyMatches(c.key, '') ? 'When any key is pressed' : `When ${keyLabel(c.key)} is pressed`),
  },
  {
    type: 'event.hover',
    category: 'events',
    label: 'When mouse over',
    description: 'Runs when the mouse moves onto an element, or off it. Phones and tablets have no mouse, so it doesn’t run there.',
    event: 'hover',
    inputs: [],
    outputs: [execOut],
    dynamicOutputs: cardOutputs,
    configFields: [
      { key: 'element', label: 'Element', type: 'element' },
      {
        key: 'action',
        label: 'When the mouse',
        type: 'select',
        options: [
          { value: 'enter', label: 'moves onto it' },
          { value: 'leave', label: 'moves off it' },
        ],
        default: 'enter',
      },
    ],
    sentence: (c, n) =>
      `When the mouse moves ${c.action === 'leave' ? 'off' : 'onto'} ${pick(n.element(c.element), 'an element')}`,
    validate: (c) => (c.element ? null : 'Pick which element this listens to.'),
  },
  {
    type: 'event.timer',
    category: 'events',
    label: 'Every few seconds',
    description: 'Runs over and over on a timer while the app is running.',
    event: 'timer',
    inputs: [],
    outputs: [execOut],
    configFields: [{ key: 'seconds', label: 'Seconds', type: 'number', default: 1 }],
    sentence: (c) => `Every ${c.seconds ?? 1} second(s)`,
    validate: (c) => (Number(c.seconds) > 0 ? null : 'Seconds must be more than 0.'),
  },
];
