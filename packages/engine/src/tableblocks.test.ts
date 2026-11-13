import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, LogicGraph } from './graph';
import { Interpreter } from './interpreter';
import { recordToValues, rowToRecord, type CellValue, type DataTable, type StoredRow } from './tables';
import type { GraphError, HostApi, TablesApi } from './types';

const contacts: DataTable = {
  id: 'contacts',
  name: 'Contacts',
  columns: [
    { id: 'c_name', name: 'Name', type: 'text' },
    { id: 'c_age', name: 'Age', type: 'number' },
    { id: 'c_vip', name: 'VIP', type: 'boolean' },
  ],
};

/** A TablesApi that keeps rows in memory, like the server does. */
function memoryTables(tables: DataTable[], seed: StoredRow[] = []): TablesApi & { data: StoredRow[] } {
  const data = seed.map((r) => ({ ...r, values: { ...r.values } }));
  let next = Math.max(0, ...data.map((r) => r.id)) + 1;
  return {
    data,
    table: (id) => tables.find((t) => t.id === id),
    rows: async () => data.map((r) => ({ ...r, values: { ...r.values } })),
    add: async (_, values) => {
      const row = { id: next++, values: { ...values } };
      data.push(row);
      return { ...row, values: { ...values } };
    },
    update: async (_, id, values: Record<string, CellValue>) => {
      const row = data.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row.values, values);
      return { ...row, values: { ...row.values } };
    },
    remove: async (_, id) => {
      const i = data.findIndex((r) => r.id === id);
      if (i < 0) return false;
      data.splice(i, 1);
      return true;
    },
  };
}

function makeHost(tables?: TablesApi) {
  const vars: Record<string, unknown> = {};
  const host: HostApi = {
    getVar: (id) => vars[id],
    setVar: (id, v) => void (vars[id] = v),
    getElementValue: () => '',
    setElementProp: () => {},
    toast: () => {},
    navigate: () => {},
    storageGet: () => undefined,
    storageSet: () => {},
    sleep: async () => {},
    httpRequest: async () => {
      throw new Error('offline');
    },
    tables,
  };
  return { host, vars };
}

let y = 0;
const n = (id: string, type: string, config: Record<string, unknown> = {}): GraphNode => ({ id, type, config, position: { x: 0, y: y++ } });
const ex = (s: string, t: string, pin = 'next'): GraphEdge => ({ id: `${s}-${pin}-${t}`, source: s, sourcePin: pin, target: t, targetPin: 'in', kind: 'exec' });
const da = (s: string, sp: string, t: string, tp: string): GraphEdge => ({ id: `${s}-${sp}-${t}-${tp}`, source: s, sourcePin: sp, target: t, targetPin: tp, kind: 'data' });

/** Runs `blocks` after a start event, then stores outputs in variables. */
async function run(tables: TablesApi | undefined, nodes: GraphNode[], edges: GraphEdge[]) {
  const { host, vars } = makeHost(tables);
  const errors: GraphError[] = [];
  const graph: LogicGraph = { nodes: [n('e', 'event.screenLoad', { screen: 's' }), ...nodes], edges };
  await new Interpreter(graph, host, { onError: (e) => errors.push(e) }).runEvent('e');
  return { vars, errors };
}

const seed: StoredRow[] = [
  { id: 1, values: { c_name: 'Ada', c_age: 36, c_vip: true } },
  { id: 2, values: { c_name: 'Bo', c_age: '41', c_vip: false, old_column: 'x' } },
  { id: 3, values: { c_name: 'Cy' } },
];

describe('rows and records', () => {
  it('turns rows into records by column name, converting to each column’s kind', () => {
    expect(rowToRecord(contacts, seed[1])).toEqual({ id: 2, Name: 'Bo', Age: 41, VIP: false });
    expect(rowToRecord(contacts, seed[2])).toEqual({ id: 3, Name: 'Cy', Age: null, VIP: false });
  });

  it('turns records into cells, matching fields to columns ignoring case', () => {
    expect(recordToValues(contacts, { name: 'Di', AGE: '7', id: 99, nickname: 'D' })).toEqual({ c_name: 'Di', c_age: 7 });
    expect(recordToValues(contacts, 'not a record')).toEqual({});
  });
});

describe('table blocks', () => {
  it('gets every row, or the rows where a column has a value', async () => {
    const tables = memoryTables([contacts], seed);
    const all = await run(
      tables,
      [n('q', 'table.query', { table: 'contacts' }), n('set', 'action.setVariable', { variable: 'rows' }), n('cnt', 'action.setVariable', { variable: 'count' })],
      [ex('e', 'q'), ex('q', 'set'), ex('set', 'cnt'), da('q', 'rows', 'set', 'value'), da('q', 'count', 'cnt', 'value')],
    );
    expect(all.vars.count).toBe(3);
    expect((all.vars.rows as { Name: string }[]).map((r) => r.Name)).toEqual(['Ada', 'Bo', 'Cy']);

    const some = await run(
      tables,
      [n('q', 'table.query', { table: 'contacts', field: 'vip', equals: 'true' }), n('set', 'action.setVariable', { variable: 'first' })],
      [ex('e', 'q'), ex('q', 'set'), da('q', 'first', 'set', 'value')],
    );
    expect(some.vars.first).toEqual({ id: 1, Name: 'Ada', Age: 36, VIP: true });

    const byAge = await run(
      tables,
      [n('q', 'table.query', { table: 'contacts', field: 'Age', equals: 41 }), n('set', 'action.setVariable', { variable: 'n' })],
      [ex('e', 'q'), ex('q', 'set'), da('q', 'count', 'set', 'value')],
    );
    expect(byAge.vars.n).toBe(1);
  });

  it('explains a column that doesn’t exist', async () => {
    const { errors } = await run(memoryTables([contacts], seed), [n('q', 'table.query', { table: 'contacts', field: 'Email' })], [ex('e', 'q')]);
    expect(errors.map((e) => [e.nodeId, e.message])).toEqual([['q', '“Email” isn’t a column of “Contacts”.']]);
  });

  it('adds a row from a record and gives its id', async () => {
    const tables = memoryTables([contacts], seed);
    const { vars, errors } = await run(
      tables,
      [
        n('rec', 'data.makeRecord', { fields: [{ id: 'a', name: 'name' }, { id: 'b', name: 'Age' }], f_a: 'Di', f_b: '29' }),
        n('add', 'table.add', { table: 'contacts' }),
        n('set', 'action.setVariable', { variable: 'id' }),
        n('setRow', 'action.setVariable', { variable: 'row' }),
      ],
      [ex('e', 'add'), ex('add', 'set'), ex('set', 'setRow'), da('rec', 'value', 'add', 'values'), da('add', 'id', 'set', 'value'), da('add', 'row', 'setRow', 'value')],
    );
    expect(errors).toEqual([]);
    expect(vars.id).toBe(4);
    expect(vars.row).toEqual({ id: 4, Name: 'Di', Age: 29, VIP: false });
    expect(tables.data.at(-1)).toEqual({ id: 4, values: { c_name: 'Di', c_age: 29 } });
  });

  it('updates and deletes rows by id, and says when a row isn’t found', async () => {
    const tables = memoryTables([contacts], seed);
    const { vars } = await run(
      tables,
      [
        n('rec', 'data.makeRecord', { fields: [{ id: 'a', name: 'VIP' }], f_a: 'yes' }),
        n('up', 'table.update', { table: 'contacts', rowId: 3 }),
        n('upFound', 'action.setVariable', { variable: 'updated' }),
        n('del', 'table.delete', { table: 'contacts', rowId: 1 }),
        n('delFound', 'action.setVariable', { variable: 'deleted' }),
        n('again', 'table.delete', { table: 'contacts', rowId: 1 }),
        n('againFound', 'action.setVariable', { variable: 'deletedAgain' }),
      ],
      [
        ex('e', 'up'),
        ex('up', 'upFound'),
        ex('upFound', 'del'),
        ex('del', 'delFound'),
        ex('delFound', 'again'),
        ex('again', 'againFound'),
        da('rec', 'value', 'up', 'values'),
        da('up', 'found', 'upFound', 'value'),
        da('del', 'found', 'delFound', 'value'),
        da('again', 'found', 'againFound', 'value'),
      ],
    );
    expect(vars).toEqual({ updated: true, deleted: true, deletedAgain: false });
    expect(tables.data).toEqual([
      { id: 2, values: seed[1].values },
      { id: 3, values: { c_name: 'Cy', c_vip: true } },
    ]);
  });

  it('stops with a friendly message when there is no table', async () => {
    const missing = await run(memoryTables([]), [n('q', 'table.query', { table: 'gone' })], [ex('e', 'q')]);
    expect(missing.errors[0].message).toMatch(/no longer exists/);
    const noTables = await run(undefined, [n('q', 'table.query', { table: 'contacts' })], [ex('e', 'q')]);
    expect(noTables.errors[0].message).toBe('Tables aren’t available here.');
    const unpicked = await run(memoryTables([contacts]), [n('q', 'table.query')], [ex('e', 'q')]);
    expect(unpicked.errors[0].message).toBe('Pick which table this block uses.');
  });
});
