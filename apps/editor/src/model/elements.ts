import { isRecord, toList, toNumber, toText } from '@code-blocks/engine/convert';
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
  /** An optional number that may be below zero (sizes can't be). */
  negative?: boolean;
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
  number: {
    type: 'number',
    label: 'Number Box',
    icon: '#',
    description: 'Lets people type a number.',
    canHaveChildren: false,
    defaults: { placeholder: '0', value: '', min: '', max: '', step: 1, visible: true },
    fields: [
      { key: 'placeholder', label: 'Hint text', type: 'text' },
      { key: 'value', label: 'Starting value', type: 'number', optional: true, negative: true, placeholder: 'Empty' },
      { key: 'min', label: 'Smallest', type: 'number', optional: true, negative: true, placeholder: 'No limit' },
      { key: 'max', label: 'Biggest', type: 'number', optional: true, negative: true, placeholder: 'No limit' },
      { key: 'step', label: 'Step', type: 'number', optional: true, placeholder: '1', help: 'How much the arrows change it.' },
      visibleField,
    ],
  },
  slider: {
    type: 'slider',
    label: 'Slider',
    icon: '⇆',
    description: 'Lets people pick a number by sliding.',
    canHaveChildren: false,
    defaults: { value: 50, min: 0, max: 100, step: 1, showValue: true, visible: true },
    fields: [
      { key: 'value', label: 'Starting value', type: 'number', optional: true, negative: true, placeholder: 'Smallest' },
      { key: 'min', label: 'Smallest', type: 'number', optional: true, negative: true, placeholder: '0' },
      { key: 'max', label: 'Biggest', type: 'number', optional: true, negative: true, placeholder: '100' },
      { key: 'step', label: 'Step', type: 'number', optional: true, placeholder: '1', help: 'The slider moves by this much.' },
      { key: 'showValue', label: 'Show the number', type: 'boolean' },
      visibleField,
    ],
  },
  link: {
    type: 'link',
    label: 'Link',
    icon: '↗',
    description: 'Text that opens a web page, an email or a phone number.',
    canHaveChildren: false,
    defaults: { text: 'Visit our website', url: '', newTab: true, visible: true },
    fields: [
      { key: 'text', label: 'Text', type: 'text', bindable: 'text' },
      {
        key: 'url',
        label: 'Web address',
        type: 'text',
        bindable: 'text',
        placeholder: 'example.com',
        help: 'A web page, or mailto: / tel: for an email or a phone number.',
      },
      { key: 'newTab', label: 'Open in a new tab', type: 'boolean', help: 'While editing, links always open in a new tab.' },
      visibleField,
    ],
  },
  divider: {
    type: 'divider',
    label: 'Divider',
    icon: '―',
    description: 'A line between elements.',
    canHaveChildren: false,
    defaults: { color: '#dee2e6', thickness: 1, visible: true },
    fields: [
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'thickness', label: 'Thickness', type: 'number' },
      visibleField,
    ],
  },
  spacer: {
    type: 'spacer',
    label: 'Spacer',
    icon: '↕',
    description: 'Empty space between elements. Only shown while designing.',
    canHaveChildren: false,
    defaults: { size: 24, visible: true },
    fields: [{ key: 'size', label: 'Size', type: 'number', help: 'How much space, across and down.' }, visibleField],
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
  'number',
  'slider',
  'image',
  'link',
  'divider',
  'spacer',
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

/** A number setting that may be left empty: undefined when it is. */
function optionalNumber(v: unknown): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export interface NumberLimits {
  min?: number;
  max?: number;
  step: number;
}

/**
 * The smallest and biggest numbers and the step set on a Number Box or a
 * Slider. A slider always has both ends (0 and 100 unless set). Ends set the
 * wrong way round are swapped, and a step of 0 or less counts as 1.
 */
export function numberLimits(props: Record<string, unknown>, slider: boolean): NumberLimits {
  let min = optionalNumber(props.min);
  let max = optionalNumber(props.max);
  if (slider) {
    min ??= 0;
    max ??= 100;
  }
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  const step = optionalNumber(props.step);
  return { min, max, step: step && step > 0 ? step : 1 };
}

/**
 * The number blocks read from a Number Box or Slider: kept between its
 * smallest and biggest numbers. A slider's also lands on a step, and starts at
 * its smallest number when no value is set. An empty Number Box stays empty.
 */
export function fitNumber(value: unknown, limits: NumberLimits, slider: boolean): number | '' {
  const empty = value === '' || value === null || value === undefined;
  if (empty && !slider) return '';
  let n = empty ? (limits.min ?? 0) : toNumber(value);
  if (slider) {
    const base = limits.min ?? 0;
    // toPrecision drops float noise such as 0.30000000000000004.
    n = Number((base + Math.round((n - base) / limits.step) * limits.step).toPrecision(12));
  }
  if (limits.max !== undefined) n = Math.min(limits.max, n);
  if (limits.min !== undefined) n = Math.max(limits.min, n);
  return n;
}

/**
 * The address a Link opens, or undefined when it can't open one. Web pages,
 * email (mailto:) and phone numbers (tel:) are allowed; an address without one,
 * such as `example.com`, gets `https://`. Anything else, such as `javascript:`,
 * is refused, so a link can't run code.
 */
export function linkHref(url: unknown): string | undefined {
  const text = toText(url).trim();
  if (!text) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)?.[1]?.toLowerCase();
  if (!scheme) return /\s/.test(text) ? undefined : `https://${text.replace(/^\/\//, '')}`;
  return ['http', 'https', 'mailto', 'tel'].includes(scheme) ? text : undefined;
}
