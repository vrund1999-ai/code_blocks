import { makeElement, makeProject, newId } from '../model/factory';
import type { GraphEdge, GraphNode, Project, UIElement, Variable } from '../model/types';

function graph() {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  return {
    nodes,
    edges,
    node(type: string, x: number, y: number, config: Record<string, unknown> = {}) {
      const id = newId();
      nodes.push({ id, type, position: { x, y }, config });
      return id;
    },
    exec(source: string, sourcePin: string, target: string) {
      edges.push({ id: newId(), source, sourcePin, target, targetPin: 'in', kind: 'exec' });
    },
    data(source: string, sourcePin: string, target: string, targetPin: string) {
      edges.push({ id: newId(), source, sourcePin, target, targetPin, kind: 'data' });
    },
  };
}

const add = (parent: UIElement, ...els: UIElement[]) => {
  parent.children.push(...els);
  return els;
};

function blank(): Project {
  return makeProject('My App');
}

function helloName(): Project {
  const p = makeProject('Hello Name');
  const root = p.screens[0].root;
  const title = makeElement('text', 'Title', { text: "What's your name?", size: 'title', bold: true });
  const input = makeElement('input', 'Name Box', { placeholder: 'Type your name' });
  const button = makeElement('button', 'Say Hello', { label: 'Say hello' });
  const greeting = makeElement('text', 'Greeting', { text: 'Your greeting will appear here', size: 'large' });
  add(root, title, input, button, greeting);

  const g = graph();
  const click = g.node('event.click', 40, 40, { element: button.id });
  const value = g.node('data.getInputValue', 40, 240, { element: input.id });
  const join = g.node('data.join', 340, 220, { a: 'Hello, ' });
  const set = g.node('action.setText', 640, 40, { element: greeting.id });
  g.exec(click, 'next', set);
  g.data(value, 'value', join, 'b');
  g.data(join, 'value', set, 'text');
  p.graph = { nodes: g.nodes, edges: g.edges };
  return p;
}

function counter(): Project {
  const p = makeProject('Counter');
  const count: Variable = { id: newId(), name: 'count', type: 'number', initial: 0 };
  p.variables.push(count);
  const root = p.screens[0].root;
  root.props.align = { kind: 'static', value: 'center' };
  const title = makeElement('text', 'Title', { text: 'Counter', size: 'title', bold: true });
  const number = makeElement('text', 'Count Display', { size: 'title' });
  number.props.text = { kind: 'variable', variableId: count.id };
  const row = makeElement('container', 'Buttons', { direction: 'row', border: false, padding: 0 });
  const minus = makeElement('button', 'Minus', { label: '− 1', variant: 'secondary' });
  const plus = makeElement('button', 'Plus', { label: '+ 1' });
  add(row, minus, plus);
  add(root, title, number, row);

  const g = graph();
  const onPlus = g.node('event.click', 40, 40, { element: plus.id });
  const inc = g.node('action.changeVariable', 340, 40, { variable: count.id, amount: 1 });
  const onMinus = g.node('event.click', 40, 260, { element: minus.id });
  const dec = g.node('action.changeVariable', 340, 260, { variable: count.id, amount: -1 });
  g.exec(onPlus, 'next', inc);
  g.exec(onMinus, 'next', dec);
  p.graph = { nodes: g.nodes, edges: g.edges };
  return p;
}

function todo(): Project {
  const p = makeProject('To-do List');
  const tasks: Variable = { id: newId(), name: 'tasks', type: 'list', initial: [] };
  p.variables.push(tasks);
  const screen = p.screens[0];
  const root = screen.root;
  const title = makeElement('text', 'Title', { text: 'My To-do List', size: 'title', bold: true });
  const row = makeElement('container', 'New Task Row', { direction: 'row', border: false, padding: 0 });
  const input = makeElement('input', 'Task Box', { placeholder: 'What needs doing?' });
  const button = makeElement('button', 'Add Button', { label: 'Add' });
  add(row, input, button);
  const list = makeElement('list', 'Task List', { emptyText: 'No tasks yet — add one above!' });
  list.props.items = { kind: 'variable', variableId: tasks.id };
  add(root, title, row, list);

  const g = graph();
  // 1. When the screen opens, load saved tasks.
  const onLoad = g.node('event.screenLoad', 40, 40, { screen: screen.id });
  const load = g.node('action.loadStorage', 340, 40, { key: 'tasks' });
  const ifFound = g.node('flow.if', 640, 40);
  const restore = g.node('action.setVariable', 940, 40, { variable: tasks.id });
  g.exec(onLoad, 'next', load);
  g.exec(load, 'next', ifFound);
  g.data(load, 'found', ifFound, 'condition');
  g.exec(ifFound, 'then', restore);
  g.data(load, 'value', restore, 'value');

  // 2. When Add is clicked, add the typed task (unless it is empty).
  const onAdd = g.node('event.click', 40, 340, { element: button.id });
  const typed = g.node('data.getInputValue', 40, 560, { element: input.id });
  const isEmpty = g.node('data.compare', 340, 560, { op: 'empty' });
  const ifEmpty = g.node('flow.if', 340, 340);
  const warn = g.node('action.toast', 640, 300, { message: 'Type a task first' });
  const push = g.node('action.addToList', 640, 480, { variable: tasks.id });
  const clear = g.node('action.setInputValue', 940, 480, { element: input.id, value: '' });
  const save = g.node('action.saveStorage', 1240, 480, { key: 'tasks' });
  const current = g.node('data.getVariable', 940, 680, { variable: tasks.id });
  g.exec(onAdd, 'next', ifEmpty);
  g.data(typed, 'value', isEmpty, 'a');
  g.data(isEmpty, 'value', ifEmpty, 'condition');
  g.exec(ifEmpty, 'then', warn);
  g.exec(ifEmpty, 'else', push);
  g.data(typed, 'value', push, 'item');
  g.exec(push, 'next', clear);
  g.exec(clear, 'next', save);
  g.data(current, 'value', save, 'value');

  // 3. When a task's delete button is clicked, remove it.
  const onDelete = g.node('event.listDelete', 40, 860, { element: list.id });
  const remove = g.node('action.removeFromList', 340, 860, { variable: tasks.id });
  const save2 = g.node('action.saveStorage', 640, 860, { key: 'tasks' });
  const current2 = g.node('data.getVariable', 340, 1060, { variable: tasks.id });
  g.exec(onDelete, 'next', remove);
  g.data(onDelete, 'index', remove, 'index');
  g.exec(remove, 'next', save2);
  g.data(current2, 'value', save2, 'value');

  p.graph = { nodes: g.nodes, edges: g.edges };
  return p;
}

export const TEMPLATES: { id: string; name: string; description: string; create(): Project }[] = [
  { id: 'blank', name: 'Blank app', description: 'Start from an empty screen.', create: blank },
  { id: 'hello', name: 'Hello Name', description: 'Type your name, click, get greeted.', create: helloName },
  { id: 'counter', name: 'Counter', description: 'Plus and minus buttons with a variable.', create: counter },
  { id: 'todo', name: 'To-do List', description: 'Add and delete tasks; saved on this device.', create: todo },
];
