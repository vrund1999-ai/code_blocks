// Records: values with named fields, such as { name: 'Ada', age: 36 }.

import { findField, toRecord, toText } from '../convert';
import { execIn, execOut, GraphError, type NodeDef, type Pin } from '../types';

export interface RecordField {
  id: string;
  name: string;
}

/** The fields set up on a "Make record" block, ignoring anything malformed. */
export function recordFields(config: Record<string, unknown>): RecordField[] {
  const raw = config.fields;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is RecordField => typeof f === 'object' && f !== null && typeof f.id === 'string' && typeof f.name === 'string',
  );
}

/** Input pin for one field. The id stays the same when the field is renamed, so wires survive. */
export const fieldPinId = (fieldId: string) => `f_${fieldId}`;

const pick = (name: string | undefined, fallback: string) => (name ? `“${name}”` : fallback);

export const recordNodes: NodeDef[] = [
  {
    type: 'data.makeRecord',
    category: 'lists',
    label: 'Make record',
    description: 'Groups several values into one record with named fields, like a contact card.',
    inputs: [],
    dynamicInputs: (config) =>
      recordFields(config).map(
        (f): Pin => ({
          id: fieldPinId(f.id),
          label: f.name.trim() || '(no name)',
          kind: 'data',
          valueType: 'any',
          inline: { type: 'text', default: '' },
        }),
      ),
    outputs: [{ id: 'value', label: 'Record', kind: 'data', valueType: 'record' }],
    configFields: [
      {
        key: 'fields',
        label: 'Fields',
        type: 'fields',
        default: [
          { id: 'name', name: 'name' },
          { id: 'age', name: 'age' },
        ],
      },
    ],
    sentence: (c) => {
      const names = recordFields(c)
        .map((f) => f.name.trim())
        .filter(Boolean);
      return names.length ? `Record with ${names.join(', ')}` : 'Add some fields';
    },
    validate: (c) => {
      const seen = new Set<string>();
      for (const f of recordFields(c)) {
        const name = f.name.trim().toLowerCase();
        if (name === '') return 'One of the fields in this “Make record” block has no name.';
        if (seen.has(name)) return `Two fields in this “Make record” block are called “${f.name.trim()}”.`;
        seen.add(name);
      }
      return null;
    },
    async evaluate(ctx) {
      const rec: Record<string, unknown> = {};
      for (const f of recordFields(ctx.config)) rec[f.name.trim()] = await ctx.input(fieldPinId(f.id));
      return { value: rec };
    },
  },
  {
    type: 'data.getField',
    category: 'lists',
    label: 'Get field',
    description: 'Reads one field of a record, such as the “name” of a contact.',
    inputs: [
      { id: 'record', label: 'Record', kind: 'data', valueType: 'record' },
      { id: 'field', label: 'Field', kind: 'data', valueType: 'text', inline: { type: 'text', default: 'name' } },
    ],
    outputs: [
      { id: 'value', label: 'Value', kind: 'data', valueType: 'any' },
      { id: 'found', label: 'Has field', kind: 'data', valueType: 'boolean' },
    ],
    configFields: [],
    sentence: (c) => `Field ${pick(toText(c.field ?? 'name'), '…')} of a record`,
    async evaluate(ctx) {
      const rec = toRecord(await ctx.input('record'));
      const key = findField(rec, toText(await ctx.input('field')));
      return { value: key === undefined ? '' : rec[key], found: key !== undefined };
    },
  },
  {
    type: 'data.setField',
    category: 'lists',
    label: 'Change field',
    description: 'Gives you a copy of a record with one field changed, or added if it is new.',
    inputs: [
      { id: 'record', label: 'Record', kind: 'data', valueType: 'record' },
      { id: 'field', label: 'Field', kind: 'data', valueType: 'text', inline: { type: 'text', default: 'name' } },
      { id: 'value', label: 'New value', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
    ],
    outputs: [{ id: 'value', label: 'Changed record', kind: 'data', valueType: 'record' }],
    configFields: [],
    sentence: (c) => `Record with ${pick(toText(c.field ?? 'name'), '…')} changed`,
    async evaluate(ctx) {
      const rec = toRecord(await ctx.input('record'));
      const name = toText(await ctx.input('field'));
      const value = await ctx.input('value');
      if (name.trim() === '') return { value: rec };
      return { value: { ...rec, [findField(rec, name) ?? name.trim()]: value } };
    },
  },
  {
    type: 'action.setVariableField',
    category: 'actions',
    label: 'Set field of variable',
    description: 'Changes one field of a record variable, or adds the field if it is new.',
    inputs: [
      execIn,
      { id: 'field', label: 'Field', kind: 'data', valueType: 'text', inline: { type: 'text', default: 'name' } },
      { id: 'value', label: 'New value', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
    ],
    outputs: [execOut],
    configFields: [{ key: 'variable', label: 'Record', type: 'variable', variableTypes: ['record'] }],
    sentence: (c, n) => `Set a field of ${pick(n.variable(c.variable), 'a record')}`,
    validate: (c) => (c.variable ? null : 'This “Set field of variable” block has no record variable picked.'),
    async execute(ctx) {
      const id = String(ctx.config.variable);
      const rec = toRecord(ctx.host.getVar(id));
      const name = toText(await ctx.input('field'));
      if (name.trim() === '') throw new GraphError(ctx.node.id, 'Type the name of the field to set.');
      ctx.host.setVar(id, { ...rec, [findField(rec, name) ?? name.trim()]: await ctx.input('value') });
    },
  },
];
