import { execOut, type NodeDef } from '../types';

const pick = (name: string | undefined, fallback: string) => (name ? `“${name}”` : fallback);

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
    description: 'Runs when someone types in a text box or ticks a checkbox.',
    event: 'change',
    inputs: [],
    outputs: [execOut, { id: 'value', label: 'New value', kind: 'data', valueType: 'any' }],
    configFields: [
      {
        key: 'element',
        label: 'Text box / checkbox',
        type: 'element',
        elementTypes: ['input', 'checkbox'],
      },
    ],
    sentence: (c, n) => `When ${pick(n.element(c.element), 'an input')} changes`,
    validate: (c) => (c.element ? null : 'Pick which text box or checkbox this listens to.'),
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
