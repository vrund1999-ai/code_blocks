import type { ElementType, PropValue, ValueType } from './types';

/** Describes one editable property of a UI element, used by the Inspector. */
export interface PropField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'color';
  options?: { value: string; label: string }[];
  /** If set, the user may bind this prop to a variable of a compatible type. */
  bindable?: ValueType;
  help?: string;
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
};

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
      { key: 'width', label: 'Width', type: 'number' },
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
  list: {
    type: 'list',
    label: 'List',
    icon: '☰',
    description: 'Shows every item of a list variable, one per row.',
    canHaveChildren: false,
    defaults: { items: [], emptyText: 'Nothing here yet', showDelete: true, visible: true },
    fields: [
      {
        key: 'items',
        label: 'Items',
        type: 'text',
        bindable: 'list',
        help: 'Bind this to a list variable to show its items.',
      },
      { key: 'emptyText', label: 'Text when empty', type: 'text' },
      { key: 'showDelete', label: 'Show delete buttons', type: 'boolean' },
      visibleField,
    ],
  },
};

export const ELEMENT_ORDER: ElementType[] = [
  'container',
  'text',
  'button',
  'input',
  'checkbox',
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
