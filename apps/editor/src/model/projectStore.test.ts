import { beforeEach, describe, expect, it } from 'vitest';
import { makeProject } from './factory';
import { useProjectStore } from './projectStore';
import { findInProject } from './tree';

const store = () => useProjectStore.getState();
const root = () => store().project.screens[0].root;

beforeEach(() => {
  store().loadProject(makeProject('Test'));
});

describe('projectStore', () => {
  it('adds elements with friendly unique names', () => {
    const a = store().addElement('button', root().id);
    const b = store().addElement('button', root().id);
    expect(findInProject(store().project, a)?.el.name).toBe('Button 1');
    expect(findInProject(store().project, b)?.el.name).toBe('Button 2');
    expect(store().selection).toEqual({ kind: 'element', id: b });
  });

  it('refuses to add children to non-containers', () => {
    const t = store().addElement('text', root().id);
    store().addElement('button', t);
    expect(root().children).toHaveLength(1);
  });

  it('moves elements between containers and reorders', () => {
    const box = store().addElement('container', root().id);
    const t1 = store().addElement('text', root().id);
    const t2 = store().addElement('text', root().id);
    store().moveElement(t2, root().id, 0);
    expect(root().children.map((c) => c.id)).toEqual([t2, box, t1]);
    store().moveElement(t1, box, 0);
    expect(root().children.map((c) => c.id)).toEqual([t2, box]);
    expect(root().children[1].children.map((c) => c.id)).toEqual([t1]);
    // moving down within the same parent accounts for the removed slot
    store().moveElement(t2, root().id, 2);
    expect(root().children.map((c) => c.id)).toEqual([box, t2]);
  });

  it('does not move a container into itself', () => {
    const box = store().addElement('container', root().id);
    const inner = store().addElement('container', box);
    store().moveElement(box, inner, 0);
    expect(root().children[0].id).toBe(box);
  });

  it('deleting an element clears logic references to it and its children', () => {
    const box = store().addElement('container', root().id);
    const btn = store().addElement('button', box);
    const n = store().addNode('event.click', { x: 0, y: 0 }, { element: btn });
    store().deleteElement(box);
    expect(root().children).toHaveLength(0);
    expect(store().project.graph.nodes.find((x) => x.id === n)?.config.element).toBeUndefined();
  });

  it('deleting a variable unbinds props and clears node config', () => {
    const v = store().addVariable('text');
    const t = store().addElement('text', root().id);
    store().setElementProp(t, 'text', { kind: 'variable', variableId: v });
    const n = store().addNode('data.getVariable', { x: 0, y: 0 }, { variable: v });
    store().deleteVariable(v);
    expect(findInProject(store().project, t)?.el.props.text).toEqual({ kind: 'static', value: 'Some text' });
    expect(store().project.graph.nodes.find((x) => x.id === n)?.config.variable).toBeUndefined();
  });

  it('removes edges with deleted nodes and replaces duplicate inputs', () => {
    const a = store().addNode('data.text', { x: 0, y: 0 });
    const b = store().addNode('data.text', { x: 0, y: 0 });
    const t = store().addNode('action.toast', { x: 0, y: 0 });
    store().addEdge({ source: a, sourcePin: 'value', target: t, targetPin: 'message', kind: 'data' });
    store().addEdge({ source: b, sourcePin: 'value', target: t, targetPin: 'message', kind: 'data' });
    expect(store().project.graph.edges).toHaveLength(1);
    expect(store().project.graph.edges[0].source).toBe(b);
    store().deleteNodes([b]);
    expect(store().project.graph.edges).toHaveLength(0);
  });

  it('undoes and redoes changes', () => {
    const t = store().addElement('text', root().id);
    store().setElementProp(t, 'text', { kind: 'static', value: 'Hi' });
    store().undo();
    expect(findInProject(store().project, t)?.el.props.text).toEqual({ kind: 'static', value: 'Some text' });
    store().undo();
    expect(root().children).toHaveLength(0);
    expect(store().selection).toBeNull();
    store().redo();
    store().redo();
    expect(findInProject(store().project, t)?.el.props.text).toEqual({ kind: 'static', value: 'Hi' });
  });

  it('merges rapid typing into one undo step', () => {
    const t = store().addElement('text', root().id);
    store().setElementProp(t, 'text', { kind: 'static', value: 'H' });
    store().setElementProp(t, 'text', { kind: 'static', value: 'He' });
    store().setElementProp(t, 'text', { kind: 'static', value: 'Hey' });
    store().undo();
    expect(findInProject(store().project, t)?.el.props.text).toEqual({ kind: 'static', value: 'Some text' });
  });

  it('adds record variables that start empty and reset when the kind changes', () => {
    const id = store().addVariable('record');
    const v = () => store().project.variables.find((x) => x.id === id)!;
    expect(v()).toMatchObject({ name: 'my record', type: 'record', initial: {} });
    store().updateVariable(id, { initial: { name: 'Ada' } });
    store().updateVariable(id, { type: 'list' });
    expect(v().initial).toEqual([]);
    store().updateVariable(id, { type: 'record' });
    expect(v().initial).toEqual({});
  });

  it('drops wires and typed values of record fields that are removed', () => {
    const make = store().addNode('data.makeRecord', { x: 0, y: 0 });
    const text = store().addNode('data.text', { x: 0, y: 0 });
    const node = () => store().project.graph.nodes.find((x) => x.id === make)!;
    const twoFields = [
      { id: 'a', name: 'name' },
      { id: 'b', name: 'age' },
    ];
    store().updateNodeConfig(make, { fields: twoFields, f_b: '36' });
    store().addEdge({ source: text, sourcePin: 'value', target: make, targetPin: 'f_a', kind: 'data' });
    store().addEdge({ source: text, sourcePin: 'value', target: make, targetPin: 'f_b', kind: 'data' });

    // Renaming keeps the wire: pins are keyed by field id, not name.
    store().updateNodeConfig(make, { fields: [{ id: 'a', name: 'full name' }, twoFields[1]] });
    expect(store().project.graph.edges.map((e) => e.targetPin).sort()).toEqual(['f_a', 'f_b']);

    store().updateNodeConfig(make, { fields: [{ id: 'a', name: 'full name' }] });
    expect(store().project.graph.edges.map((e) => e.targetPin)).toEqual(['f_a']);
    expect(node().config).not.toHaveProperty('f_b');

    store().undo();
    expect(store().project.graph.edges).toHaveLength(2);
    expect(node().config.f_b).toBe('36');
  });

  it('builds List cards but keeps text boxes out of them', () => {
    const list = store().addElement('list', root().id);
    const name = store().addElement('text', list);
    expect(store().addElement('input', list)).toBe('');
    expect(store().selection).toEqual({ kind: 'element', id: name });

    const box = store().addElement('input', root().id);
    store().moveElement(box, list, 0);
    expect(root().children.map((c) => c.id)).toEqual([list, box]);
    store().moveElement(name, root().id, 0);
    expect(root().children.map((c) => c.id)).toEqual([name, list, box]);
  });
});

describe('addWiredNode', () => {
  it('adds a block wired after another, as one undo step', () => {
    const click = store().addNode('event.click', { x: 0, y: 0 });
    const toast = store().addWiredNode('action.toast', { x: 300, y: 0 }, { nodeId: click, pinId: 'next', side: 'out' }, 'in', 'exec');
    const { nodes, edges } = store().project.graph;
    expect(nodes.find((n) => n.id === toast)?.type).toBe('action.toast');
    expect(edges).toMatchObject([{ source: click, sourcePin: 'next', target: toast, targetPin: 'in', kind: 'exec' }]);
    expect(store().selection).toEqual({ kind: 'node', id: toast });
    store().undo();
    expect(store().project.graph.nodes.map((n) => n.id)).toEqual([click]);
    expect(store().project.graph.edges).toEqual([]);
  });

  it('adds a block feeding an input, replacing the wire that was there', () => {
    const set = store().addNode('action.setText', { x: 400, y: 0 });
    const a = store().addNode('data.text', { x: 0, y: 0 });
    store().addEdge({ source: a, sourcePin: 'value', target: set, targetPin: 'text', kind: 'data' });
    const b = store().addWiredNode('data.join', { x: 0, y: 100 }, { nodeId: set, pinId: 'text', side: 'in' }, 'value', 'data');
    expect(store().project.graph.edges).toMatchObject([{ source: b, sourcePin: 'value', target: set, targetPin: 'text' }]);
  });

  it('adds, renames and deletes tables, with undo', () => {
    const a = store().addTable();
    const b = store().addTable();
    expect(store().project.tables.map((t) => t.name)).toEqual(['My table', 'My table 2']);
    expect(store().project.tables[0].columns).toMatchObject([{ name: 'Name', type: 'text' }]);
    store().renameTable(a, 'C');
    store().renameTable(a, 'Contacts'); // typing merges into one undo step
    store().deleteTable(b);
    expect(store().project.tables.map((t) => t.name)).toEqual(['Contacts']);
    store().undo();
    expect(store().project.tables.map((t) => t.name)).toEqual(['Contacts', 'My table 2']);
    store().undo();
    expect(store().project.tables[0].name).toBe('My table');
  });

  it('adds, changes, moves and removes columns', () => {
    const t = store().addTable();
    const cols = () => store().project.tables[0].columns.map((c) => `${c.name}:${c.type}`);
    const age = store().addColumn(t, 'number');
    const vip = store().addColumn(t, 'boolean');
    store().addColumn(t, 'number');
    expect(cols()).toEqual(['Name:text', 'Number:number', 'Yes or no:boolean', 'Number 2:number']);
    store().updateColumn(t, age, { name: 'Age' });
    store().updateColumn(t, vip, { name: 'VIP', type: 'text' });
    store().moveColumn(t, vip, -1);
    expect(cols()).toEqual(['Name:text', 'VIP:text', 'Age:number', 'Number 2:number']);
    // Moving past either end does nothing and adds no undo step.
    const steps = store().past.length;
    store().moveColumn(t, store().project.tables[0].columns[0].id, -1);
    expect(store().past.length).toBe(steps);
    store().deleteColumn(t, age);
    expect(cols()).toEqual(['Name:text', 'VIP:text', 'Number 2:number']);
    store().undo();
    expect(cols()).toEqual(['Name:text', 'VIP:text', 'Age:number', 'Number 2:number']);
  });

  it('pastes only in the tab that matches what was copied', () => {
    const a = store().addElement('button', root().id);
    store().select({ kind: 'element', id: a });
    store().copySelection();
    store().setTab('data');
    expect(store().paste()).toEqual([]);
    store().setTab('logic');
    expect(store().paste()).toEqual([]);
    store().setTab('design');
    expect(store().paste()).toHaveLength(1);
  });

  it('clears table blocks that used a deleted table, and pasted blocks whose table is missing', () => {
    const t = store().addTable();
    store().setTab('logic');
    const q = store().addNode('table.query', { x: 0, y: 0 }, { table: t });
    store().deleteTable(t);
    expect(store().project.graph.nodes[0].config.table).toBeUndefined();
    store().undo();
    expect(store().project.graph.nodes[0].config.table).toBe(t);

    store().select({ kind: 'node', id: q });
    store().copySelection();
    store().loadProject(makeProject('Other'));
    store().setTab('logic');
    store().paste();
    expect(store().project.graph.nodes[0]).toMatchObject({ type: 'table.query', config: {} });
  });
});
