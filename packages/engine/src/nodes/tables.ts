// Table blocks: read and change the rows of the project's data tables.
// Rows reach blocks as records keyed by column name, plus their `id`.

import { findField, toNumber, toText } from '../convert';
import { recordToValues, ROW_ID, rowToRecord, type DataTable } from '../tables';
import { execIn, execOut, GraphError, type ConfigField, type NodeContext, type NodeDef, type Pin, type TablesApi } from '../types';

const tableField: ConfigField = { key: 'table', label: 'Table', type: 'table' };

const pick = (name: string | undefined, fallback: string) => (name ? `“${name}”` : fallback);

const idPin: Pin = { id: 'rowId', label: 'Row id', kind: 'data', valueType: 'number', inline: { type: 'number', default: 1 } };
const valuesPin: Pin = { id: 'values', label: 'Values', kind: 'data', valueType: 'record' };
const rowOut: Pin = { id: 'row', label: 'Row', kind: 'data', valueType: 'record' };
const foundOut: Pin = { id: 'found', label: 'Was found', kind: 'data', valueType: 'boolean' };

const validate = (c: Record<string, unknown>) => (c.table ? null : 'Pick which table this block uses.');

/** The host's tables and the block's table, or a friendly error on the block. */
function tableOf(ctx: NodeContext): { api: TablesApi; table: DataTable } {
  const api = ctx.host.tables;
  if (!api) throw new GraphError(ctx.node.id, 'Tables aren’t available here.');
  const table = api.table(String(ctx.config.table));
  if (!table) throw new GraphError(ctx.node.id, 'The table this block uses no longer exists. Pick another one.');
  return { api, table };
}

const rowIdOf = async (ctx: NodeContext) => Math.floor(toNumber(await ctx.input('rowId')));

const norm = (v: unknown) => toText(v).trim().toLowerCase();

export const tableNodes: NodeDef[] = [
  {
    type: 'table.query',
    category: 'tables',
    label: 'Get rows',
    description:
      'Loads the rows of a table as a list of records. To get only some rows, give a column in “Where column” and the value it should have in “is”.',
    inputs: [
      execIn,
      { id: 'field', label: 'Where column', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
      { id: 'equals', label: 'is', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
    ],
    outputs: [
      execOut,
      { id: 'rows', label: 'Rows', kind: 'data', valueType: 'list' },
      { id: 'count', label: 'How many', kind: 'data', valueType: 'number' },
      { id: 'first', label: 'First row', kind: 'data', valueType: 'record' },
    ],
    configFields: [tableField],
    sentence: (c, n) => `Get rows of ${pick(n.table?.(c.table), 'a table')}`,
    validate,
    async execute(ctx) {
      const { api, table } = tableOf(ctx);
      let rows = (await api.rows(table.id)).map((r) => rowToRecord(table, r));
      const column = toText(await ctx.input('field')).trim();
      if (column) {
        const known = [ROW_ID, ...table.columns.map((c) => c.name.trim())].find((n) => norm(n) === norm(column));
        if (!known) throw new GraphError(ctx.node.id, `“${column}” isn’t a column of “${table.name}”.`);
        const want = norm(await ctx.input('equals'));
        rows = rows.filter((r) => {
          const f = findField(r, known);
          return f !== undefined && norm(r[f]) === want;
        });
      }
      ctx.setOutputs({ rows, count: rows.length, first: rows[0] ?? {} });
    },
  },
  {
    type: 'table.add',
    category: 'tables',
    label: 'Add row',
    description:
      'Adds a row to a table. Connect a record (for example from “Make record”) whose fields are named like the columns.',
    inputs: [execIn, valuesPin],
    outputs: [execOut, rowOut, { id: 'id', label: 'New row id', kind: 'data', valueType: 'number' }],
    configFields: [tableField],
    sentence: (c, n) => `Add a row to ${pick(n.table?.(c.table), 'a table')}`,
    validate,
    async execute(ctx) {
      const { api, table } = tableOf(ctx);
      const row = await api.add(table.id, recordToValues(table, await ctx.input('values')));
      ctx.setOutputs({ row: rowToRecord(table, row), id: row.id });
    },
  },
  {
    type: 'table.update',
    category: 'tables',
    label: 'Update row',
    description:
      'Changes a row of a table, found by its id. Only the columns named in the record change; the others keep their values.',
    inputs: [execIn, idPin, valuesPin],
    outputs: [execOut, rowOut, foundOut],
    configFields: [tableField],
    sentence: (c, n) => `Update a row of ${pick(n.table?.(c.table), 'a table')}`,
    validate,
    async execute(ctx) {
      const { api, table } = tableOf(ctx);
      const id = await rowIdOf(ctx);
      const values = recordToValues(table, await ctx.input('values'));
      const row = id > 0 ? await api.update(table.id, id, values) : null;
      ctx.setOutputs({ row: row ? rowToRecord(table, row) : {}, found: row !== null });
    },
  },
  {
    type: 'table.delete',
    category: 'tables',
    label: 'Delete row',
    description: 'Removes a row from a table, found by its id.',
    inputs: [execIn, idPin],
    outputs: [execOut, foundOut],
    configFields: [tableField],
    sentence: (c, n) => `Delete a row of ${pick(n.table?.(c.table), 'a table')}`,
    validate,
    async execute(ctx) {
      const { api, table } = tableOf(ctx);
      const id = await rowIdOf(ctx);
      ctx.setOutputs({ found: id > 0 && (await api.remove(table.id, id)) });
    },
  },
];
