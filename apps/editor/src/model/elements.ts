import { isRecord, toList, toText } from '@code-blocks/engine/convert';
import type { ElementType, PropValue, ValueType } from './types';

/** Describes one editable property of a UI element, used by the Inspector. */
export interface PropField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'color';
  options?: { value: string; label: string }[];
  /** If set, the user may bind this prop to a variable of a compatible type. */
  bindable?: ValueType;
  /** Only makes sense linked to a variable (such as a List's items). */
  bindOnly?: boolean;
  help?: string;
  /** A number that may be left empty (for "automatic"). */
  optional?: boolean;
  placeholder?: string;
  /** Shown in the Style section of the Settings panel. */
  group?: 'style';
  /** Not offered for the screen itself. */
  notOnRoot?: boolean;
}

export interface ElementDef {
  type: ElementType;
  label: string;
  icon: string;
  description: string;
  canHaveChildren: boolean;
  defaults: Record<string, unknown>;
  fields: PropField[];
}

const visibleField: PropField = {
  key: 'visible',
  label: 'Visible',
  type: 'boolean',
  bindable: 'boolean',
  notOnRoot: true,
};

/** Size, spacing and look settings that every element has. Empty means automatic. */
export const STYLE_FIELDS: PropField[] = [
  { key: 'width', label: 'Width', type: 'number', optional: true, placeholder: 'Auto', group: 'style', notOnRoot: true },
  { key: 'height', label: 'Height', type: 'number', optional: true, placeholder: 'Auto', group: 'style', notOnRoot: true },
  { key: 'margin', label: 'Space around', type: 'number', optional: true, placeholder: '0', group: 'style', notOnRoot: true },
  { key: 'radius', label: 'Rounded corners', type: 'number', optional: true, placeholder: 'Usual', group: 'style', notOnRoot: true },
  {
    key: 'shadow',
    label: 'Shadow',
    type: 'select',
    group: 'style',
    notOnRoot: true,
    options: [
      { value: 'none', label: 'None' },
      { value: 'soft', label: 'Soft' },
      { value: 'medium', label: 'Medium' },
      { value: 'strong', label: 'Strong' },
    ],
  },
  {
    key: 'font',
    label: 'Font',
    type: 'select',
    group: 'style',
    options: [
      { value: '', label: 'Same as around it' },
      { value: 'sans', label: 'Clean (sans-serif)' },
      { value: 'serif', label: 'Classic (serif)' },
      { value: 'mono', label: 'Typewriter (monospace)' },
      { value: 'rounded', label: 'Rounded' },
      { value: 'handwriting', label: 'Handwriting' },
    ],
  },
];

const STYLE_DEFAULTS = { width: '', height: '', margin: '', radius: '', shadow: 'none', font: '' };

export const ELEMENT_DEFS: Record<ElementType, ElementDef> = {
  container: {
    type: 'container',
    label: 'Box',
    icon: '▭',
    description: 'Groups other elements together in a row or column.',
    canHaveChildren: true,
    defaults: {
      direction: 'column',
      gap: 8,
      padding: 12,
      align: 'stretch',
      background: '#ffffff',
      border: true,
      visible: true,
    },
    fields: [
      {
        key: 'direction',
        label: 'Arrange items',
        type: 'select',
        options: [
          { value: 'column', label: 'Top to bottom' },
          { value: 'row', label: 'Side by side' },
        ],
      },
      {
        key: 'align',
        label: 'Align items',
        type: 'select',
        options: [
          { value: 'stretch', label: 'Fill' },
          { value: 'flex-start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'flex-end', label: 'End' },
        ],
      },
      { key: 'gap', label: 'Space between', type: 'number' },
      { key: 'padding', label: 'Inner padding', type: 'number' },
      { key: 'background', label: 'Background', type: 'color' },
      { key: 'border', label: 'Show border', type: 'boolean' },
      visibleField,
    ],
  },
  text: {
    type: 'text',
    label: 'Text',
    icon: 'T',
    description: 'Shows a piece of text.',
    canHaveChildren: false,
    defaults: { text: 'Some text', size: 'medium', bold: false, color: '#1f2937', visible: true },
    fields: [
      { key: 'text', label: 'Text', type: 'textarea', bindable: 'text' },
      {
        key: 'size',
        label: 'Size',
        type: 'select',
        options: [
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
          { value: 'title', label: 'Title' },
        ],
      },
      { key: 'bold', label: 'Bold', type: 'boolean' },
      { key: 'color', label: 'Color', type: 'color' },
      visibleField,
    ],
  },
  button: {
    type: 'button',
    label: 'Button',
    icon: '⏺',
    description: 'Something people can click.',
    canHaveChildren: false,
    defaults: { label: 'Click me', variant: 'primary', visible: true },
    fields: [
      { key: 'label', label: 'Label', type: 'text', bindable: 'text' },
      {
        key: 'variant',
        label: 'Style',
        type: 'select',
        options: [
          { value: 'primary', label: 'Filled' },
          { value: 'secondary', label: 'Outline' },
        ],
      },
      visibleField,
    ],
  },
  input: {
    type: 'input',
    label: 'Text Box',
    icon: '⌨',
    description: 'Lets people type text.',
    canHaveChildren: false,
    defaults: { placeholder: 'Type here…', value: '', visible: true },
    fields: [
      { key: 'placeholder', label: 'Hint text', type: 'text' },
      { key: 'value', label: 'Starting value', type: 'text' },
      visibleField,
    ],
  },
  image: {
    type: 'image',
    label: 'Image',
    icon: '🖼',
    description: 'Shows a picture from a web address.',
    canHaveChildren: false,
    defaults: { src: '', alt: 'Image', width: 200, visible: true },
    fields: [
      { key: 'src', label: 'Image address (URL)', type: 'text', bindable: 'text' },
      { key: 'alt', label: 'Description', type: 'text' },
      visibleField,
    ],
  },
  checkbox: {
    type: 'checkbox',
    label: 'Checkbox',
    icon: '☑',
    description: 'A tick box that is on or off.',
    canHaveChildren: false,
    defaults: { label: 'Check me', checked: false, visible: true },
    fields: [
      { key: 'label', label: 'Label', type: 'text', bindable: 'text' },
      { key: 'checked', label: 'Starts checked', type: 'boolean', bindable: 'boolean' },
      visibleField,
    ],
  },
  dropdown: {
    type: 'dropdown',
    label: 'Dropdown',
    icon: '▾',
    description: 'Lets people pick one choice from a list.',
    canHaveChildren: false,
    defaults: { options: 'Small\nMedium\nLarge', value: '', placeholder: 'Choose…', optionField: '', visible: true },
    fields: [
      {
        key: 'options',
        label: 'Choices',
        type: 'textarea',
        bindable: 'list',
        help: 'One choice per line, or 🔗 link a list variable.',
      },
      { key: 'optionField', label: 'Field to show (for records)', type: 'text', help: 'For a list of records, such as “name”.' },
      { key: 'placeholder', label: 'Hint text', type: 'text', help: 'Shown until a choice is picked.' },
      { key: 'value', label: 'Starting choice', type: 'text', help: 'Leave empty to start with nothing picked.' },
      visibleField,
    ],
  },
  list: {
    type: 'list',
    label: 'List',
    icon: '☰',
    description: 'Shows every item of a list variable. Drop elements inside it to design a card for each item.',
    canHaveChildren: true,
    defaults: { items: [], emptyText: 'Nothing here yet', showDelete: true, cardDirection: 'column', visible: true },
    fields: [
      {
        key: 'items',
        label: 'Items',
        type: 'text',
        bindable: 'list',
        bindOnly: true,
        help: 'Bind this to a list variable to show its items.',
      },
      { key: 'emptyText', label: 'Text when empty', type: 'text' },
      { key: 'showDelete', label: 'Show delete buttons', type: 'boolean' },
      {
        key: 'cardDirection',
        label: 'Arrange each card',
        type: 'select',
        options: [
          { value: 'column', label: 'Top to bottom' },
          { value: 'row', label: 'Side by side' },
        ],
        help: 'How the elements inside each card are laid out.',
      },
      visibleField,
    ],
  },
};

// Every element gets the style settings, before "Visible".
for (const def of Object.values(ELEMENT_DEFS)) {
  def.defaults = { ...STYLE_DEFAULTS, ...def.defaults };
  const at = def.fields.indexOf(visibleField);
  def.fields.splice(at < 0 ? def.fields.length : at, 0, ...STYLE_FIELDS);
}

export const ELEMENT_ORDER: ElementType[] = [
  'container',
  'text',
  'button',
  'input',
  'checkbox',
  'dropdown',
  'image',
  'list',
];

export function defaultProps(type: ElementType): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(ELEMENT_DEFS[type].defaults)) {
    out[k] = { kind: 'static', value: structuredClone(v) };
  }
  return out;
}

/**
 * A dropdown's choices: one per line of typed text, or the items of a linked
 * list. For records, `field` picks which field is shown. Empty lines and
 * repeats are left out.
 */
export function dropdownChoices(options: unknown, field = ''): string[] {
  const raw = Array.isArray(options) ? toList(options) : toText(options).split('\n');
  const key = field.trim().toLowerCase();
  const out: string[] = [];
  for (const item of raw) {
    let text = item;
    if (isRecord(item)) {
      const hit = key ? Object.keys(item).find((k) => k.toLowerCase() === key) : undefined;
      text = hit ? item[hit] : (Object.values(item)[0] ?? '');
    }
    const choice = toText(text).trim();
    if (choice && !out.includes(choice)) out.push(choice);
  }
  return out;
}
