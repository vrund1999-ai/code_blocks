// Builds projects in Node using the app's own model code, so test fixtures
// always match the real project format.
import { makeElement, makeProject, makeScreen, newId } from '../../apps/editor/src/model/factory';
import type { ColumnType, DataTable, ElementType, GraphEdge, GraphNode, Project, UIElement, Variable } from '../../apps/editor/src/model/types';
import { TEMPLATES } from '../../apps/editor/src/templates';

export function template(id: 'blank' | 'hello' | 'counter' | 'todo'): Project {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`No template "${id}"`);
  return t.create();
}

/** A small fluent builder for test projects. */
export function build(name = 'Test App') {
  const project = makeProject(name);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  project.graph = { nodes, edges };

  const api = {
    project,
    root: project.screens[0].root,
    screen: project.screens[0],
    element(type: ElementType, elName: string, props: Record<string, unknown> = {}, parent?: UIElement) {
      const el = makeElement(type, elName, props);
      (parent ?? api.root).children.push(el);
      return el;
    },
    variable(varName: string, type: Variable['type'], initial: unknown): Variable {
      const v: Variable = { id: newId(), name: varName, type, initial };
      project.variables.push(v);
      return v;
    },
    /** A data table with columns named and typed as given, e.g. { Name: 'text', Age: 'number' }. */
    table(tableName: string, columns: Record<string, ColumnType>): DataTable {
      const t: DataTable = {
        id: newId(),
        name: tableName,
        columns: Object.entries(columns).map(([colName, type]) => ({ id: newId(), name: colName, type })),
      };
      project.tables.push(t);
      return t;
    },
    addScreen(screenName: string) {
      const s = makeScreen(screenName);
      project.screens.push(s);
      return s;
    },
    /** Adds a block; blocks are laid out on a grid unless a position is given. */
    node(type: string, config: Record<string, unknown> = {}, pos?: { x: number; y: number }) {
      const id = newId();
      const i = nodes.length;
      nodes.push({ id, type, position: pos ?? { x: 40 + (i % 3) * 320, y: 40 + Math.floor(i / 3) * 240 }, config });
      return id;
    },
    exec(source: string, sourcePin: string, target: string) {
      edges.push({ id: newId(), source, sourcePin, target, targetPin: 'in', kind: 'exec' });
    },
    data(source: string, sourcePin: string, target: string, targetPin: string) {
      edges.push({ id: newId(), source, sourcePin, target, targetPin, kind: 'data' });
    },
  };
  return api;
}

/**
 * A guest list kept in a table: "Add guest" adds a row from the text box and
 * reloads the list; opening the screen loads the rows saved earlier.
 */
export function guestList() {
  const b = build('Guest list');
  const guests = b.table('Guests', { Name: 'text', Coming: 'boolean' });
  const rows = b.variable('guests', 'list', []);
  const box = b.element('input', 'Guest name');
  const add = b.element('button', 'Add guest', { label: 'Add guest' });
  const count = b.element('text', 'Count', { text: '' });
  const list = b.element('list', 'Guest List');
  list.props.items = { kind: 'variable', variableId: rows.id };
  const name = b.element('text', 'Guest', {}, list);
  name.props.text = { kind: 'item', field: 'Name' };

  // When the screen opens: Get rows → guests, and show how many.
  const open = b.node('event.screenLoad', { screen: b.screen.id });
  const load = b.node('table.query', { table: guests.id });
  const keep = b.node('action.setVariable', { variable: rows.id });
  const show = b.node('action.setText', { element: count.id });
  b.exec(open, 'next', load);
  b.exec(load, 'next', keep);
  b.exec(keep, 'next', show);
  b.data(load, 'rows', keep, 'value');
  b.data(load, 'count', show, 'text');

  // When "Add guest" is clicked: Add row { Name: typed name, Coming: yes }, then load again.
  const click = b.node('event.click', { element: add.id });
  const typed = b.node('data.getInputValue', { element: box.id });
  const rec = b.node('data.makeRecord', {
    fields: [
      { id: 'n', name: 'Name' },
      { id: 'c', name: 'coming' },
    ],
    f_c: 'yes',
  });
  const addRow = b.node('table.add', { table: guests.id });
  const reload = b.node('table.query', { table: guests.id });
  const keep2 = b.node('action.setVariable', { variable: rows.id });
  const show2 = b.node('action.setText', { element: count.id });
  b.exec(click, 'next', addRow);
  b.exec(addRow, 'next', reload);
  b.exec(reload, 'next', keep2);
  b.exec(keep2, 'next', show2);
  b.data(typed, 'value', rec, 'f_n');
  b.data(rec, 'value', addRow, 'values');
  b.data(reload, 'rows', keep2, 'value');
  b.data(reload, 'count', show2, 'text');
  return b;
}
