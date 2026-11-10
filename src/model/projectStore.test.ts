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
});
