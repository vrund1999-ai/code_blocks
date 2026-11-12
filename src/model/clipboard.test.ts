import { beforeEach, describe, expect, it } from 'vitest';
import { cloneElements, cloneNodes, copyName } from './clipboard';
import { makeElement, makeProject } from './factory';
import { useProjectStore } from './projectStore';
import { findInProject } from './tree';
import type { GraphNode } from './types';

const store = () => useProjectStore.getState();
const root = () => store().project.screens[0].root;
const names = () => root().children.map((c) => c.name);

beforeEach(() => {
  useProjectStore.setState({ clipboard: null });
  store().loadProject(makeProject('Test'));
});

describe('cloneElements', () => {
  it('gives copies new ids and unused names, all the way down', () => {
    const project = makeProject();
    const box = makeElement('container', 'Card');
    box.children.push(makeElement('text', 'Title'));
    project.screens[0].root.children.push(box);
    const [copy] = cloneElements([box], project);
    expect(copy.id).not.toBe(box.id);
    expect(copy.children[0].id).not.toBe(box.children[0].id);
    expect(copy.name).toBe('Card 2');
    expect(copy.children[0].name).toBe('Title 2');
    expect(box.name).toBe('Card'); // the original is untouched
  });

  it('puts settings linked to missing variables back to normal', () => {
    const text = makeElement('text', 'Greeting');
    text.props.text = { kind: 'variable', variableId: 'elsewhere' };
    const [copy] = cloneElements([text], makeProject());
    expect(copy.props.text).toEqual({ kind: 'static', value: expect.any(String) });
  });
});

describe('copyName', () => {
  it('counts up numbered names and adds a number to others', () => {
    expect(copyName(['Button 1'], 'Button 1')).toBe('Button 2');
    expect(copyName(['Button 1', 'Button 2'], 'Button 1')).toBe('Button 3');
    expect(copyName(['Say Hello'], 'Say Hello')).toBe('Say Hello 2');
    expect(copyName(['Step 9', 'Step 10'], 'Step 9')).toBe('Step 11');
  });
});

describe('cloneNodes', () => {
  it('keeps wires between copied blocks, moves them, and clears missing references', () => {
    const project = makeProject();
    const nodes: GraphNode[] = [
      { id: 'a', type: 'event.click', position: { x: 0, y: 0 }, config: { element: 'gone' } },
      { id: 'b', type: 'action.toast', position: { x: 300, y: 0 }, config: { message: 'Hi' } },
    ];
    const edges = [
      { id: 'e1', source: 'a', sourcePin: 'next', target: 'b', targetPin: 'in', kind: 'exec' as const },
      { id: 'e2', source: 'x', sourcePin: 'next', target: 'a', targetPin: 'in', kind: 'exec' as const },
    ];
    const copy = cloneNodes(nodes, edges, project, { x: 40, y: 40 });
    expect(copy.nodes.map((n) => n.position)).toEqual([
      { x: 40, y: 40 },
      { x: 340, y: 40 },
    ]);
    expect(copy.nodes[0].config).toEqual({});
    expect(copy.nodes[1].config).toEqual({ message: 'Hi' });
    expect(copy.edges).toHaveLength(1);
    expect(copy.edges[0]).toMatchObject({ source: copy.nodes[0].id, target: copy.nodes[1].id });
  });
});

describe('copy and paste in the store', () => {
  it('copies an element and pastes it right after the selected one', () => {
    const a = store().addElement('button', root().id);
    store().addElement('text', root().id);
    store().select({ kind: 'element', id: a });
    expect(store().copySelection()).toBe(1);
    store().paste();
    store().paste();
    // Each paste is selected, so the next one goes after it.
    expect(names()).toEqual(['Button 1', 'Button 2', 'Button 3', 'Text 1']);
    expect(findInProject(store().project, (store().selection as { id: string }).id)?.el.name).toBe('Button 3');
  });

  it('duplicates an element without changing the clipboard, and undoes in one step', () => {
    const a = store().addElement('button', root().id);
    store().duplicateSelection();
    expect(names()).toEqual(['Button 1', 'Button 2']);
    expect(store().clipboard).toBeNull();
    store().undo();
    expect(root().children.map((c) => c.id)).toEqual([a]);
  });

  it('does not copy a screen background', () => {
    store().select({ kind: 'element', id: root().id });
    expect(store().copySelection()).toBe(0);
  });

  it('pastes text boxes copied from a List card onto the screen instead', () => {
    const list = store().addElement('list', root().id);
    const box = store().addElement('input', root().id);
    store().addElement('text', list);
    store().select({ kind: 'element', id: box });
    store().copySelection();
    store().select({ kind: 'element', id: root().children[0].children[0].id }); // the text in the card
    store().paste();
    expect(root().children.map((c) => c.type)).toEqual(['list', 'input', 'input']);
  });

  it('cuts an element and pastes it on another screen', () => {
    const a = store().addElement('button', root().id);
    store().renameElement(a, 'Go');
    expect(store().cutSelection()).toBe(1);
    expect(root().children).toEqual([]);
    const other = store().addScreen();
    store().paste();
    const screen = store().project.screens.find((s) => s.id === other)!;
    expect(screen.root.children.map((c) => c.name)).toEqual(['Go']);
  });

  it('copies several blocks with their wire and pastes each copy further along', () => {
    store().setTab('logic');
    const a = store().addNode('event.click', { x: 0, y: 0 });
    const b = store().addNode('action.toast', { x: 300, y: 0 });
    store().addEdge({ source: a, sourcePin: 'next', target: b, targetPin: 'in', kind: 'exec' });
    store().select({ kind: 'node', id: b, ids: [a, b] });
    expect(store().copySelection()).toBe(2);
    const first = store().paste();
    const second = store().paste();
    const { nodes, edges } = store().project.graph;
    expect(nodes).toHaveLength(6);
    expect(edges).toHaveLength(3);
    const pos = (id: string) => nodes.find((n) => n.id === id)!.position;
    expect(pos(first[0])).toEqual({ x: 40, y: 40 });
    expect(pos(second[0])).toEqual({ x: 80, y: 80 });
    expect(store().selection).toEqual({ kind: 'node', id: second[1], ids: second });
  });

  it('keeps the clipboard when another project is opened, and only pastes in the matching tab', () => {
    store().setTab('logic');
    store().addNode('action.toast', { x: 0, y: 0 });
    store().copySelection();
    store().loadProject(makeProject('Other'));
    expect(store().paste()).toEqual([]); // a new project opens on the Design tab
    store().setTab('logic');
    expect(store().paste()).toHaveLength(1);
  });
});
