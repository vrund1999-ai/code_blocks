import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeElement, makeProject, makeScreen } from '../model/factory';
import { useProjectStore } from '../model/projectStore';
import type { GraphEdge, GraphNode, Project } from '../model/types';
import { ApiError } from '../data/api';
import { addPublishedRow, listPublishedRows } from '../data/publishApi';
import { addRow, deleteRow, listRows, updateRow } from '../data/rowsApi';
import { fetchViaServer, sendForm } from '../data/serverApi';
import { fireChange, fireClick, fireListDelete, READ_ONLY_TABLES, runAsPublished, startApp, stopApp } from './controller';
import { useRuntimeStore } from './runtimeStore';

vi.mock('../data/rowsApi', async (original) => ({
  ...(await original<typeof import('../data/rowsApi')>()),
  listRows: vi.fn(),
  addRow: vi.fn(),
  updateRow: vi.fn(),
  deleteRow: vi.fn(),
}));
vi.mock('../data/publishApi', async (original) => ({
  ...(await original<typeof import('../data/publishApi')>()),
  listPublishedRows: vi.fn(),
  addPublishedRow: vi.fn(),
}));
vi.mock('../data/serverApi', async (original) => ({
  ...(await original<typeof import('../data/serverApi')>()),
  fetchViaServer: vi.fn(),
  sendForm: vi.fn(),
}));

/** A small in-memory localStorage, since the tests run in Node. */
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, String(v)),
    removeItem: (k: string) => void items.delete(k),
    clear: () => items.clear(),
    key: (i: number) => [...items.keys()][i] ?? null,
    get length() {
      return items.size;
    },
  };
}

/** Builds a project and its graph: `node` adds a block, `exec` and `data` wire them. */
function app() {
  const p = makeProject('Test');
  let n = 0;
  const api = {
    p,
    home: p.screens[0],
    el(type: Parameters<typeof makeElement>[0], name: string, props: Record<string, unknown> = {}, parent = p.screens[0].root) {
      const el = makeElement(type, name, props);
      parent.children.push(el);
      return el;
    },
    variable(name: string, type: Project['variables'][number]['type'], initial: unknown) {
      const v = { id: `v${++n}`, name, type, initial };
      p.variables.push(v as Project['variables'][number]);
      return v.id;
    },
    node(type: string, config: Record<string, unknown> = {}) {
      const node: GraphNode = { id: `n${++n}`, type, config, position: { x: 0, y: 0 } };
      p.graph.nodes.push(node);
      return node.id;
    },
    exec(source: string, target: string, sourcePin = 'next') {
      const e: GraphEdge = { id: `e${++n}`, source, sourcePin, target, targetPin: 'in', kind: 'exec' };
      p.graph.edges.push(e);
    },
    data(source: string, sourcePin: string, target: string, targetPin: string) {
      p.graph.edges.push({ id: `e${++n}`, source, sourcePin, target, targetPin, kind: 'data' });
    },
    /** Blocks run one after another. */
    chain(...ids: string[]) {
      for (let i = 1; i < ids.length; i++) api.exec(ids[i - 1], ids[i]);
    },
    start() {
      useProjectStore.getState().loadProject(p);
      startApp();
    },
  };
  return api;
}

const rt = () => useRuntimeStore.getState();
const toasts = () => rt().toasts.map((t) => t.message);
const settle = () => vi.waitFor(() => undefined);

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  stopApp();
  runAsPublished(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('starting and stopping an app', () => {
  it('shows the first screen with each variable at its starting value, and runs the screen’s blocks', async () => {
    const a = app();
    const items = a.variable('items', 'list', ['a']);
    const n = a.variable('n', 'number', 5);
    const open = a.node('event.screenLoad', { screen: a.home.id });
    a.chain(open, a.node('action.changeVariable', { variable: n, amount: 2 }));
    a.start();

    expect(rt().running).toBe(true);
    expect(rt().screenId).toBe(a.home.id);
    await vi.waitFor(() => expect(rt().vars[n]).toBe(7));
    // A copy, so the project's starting value can't be changed by the app.
    expect(rt().vars[items]).toEqual(['a']);
    expect(rt().vars[items]).not.toBe(a.p.variables[0].initial);
  });

  it('stops: everything goes back to how it was, and events do nothing', async () => {
    const a = app();
    const btn = a.el('button', 'Go');
    a.chain(a.node('event.click', { element: btn.id }), a.node('action.toast', { message: 'Hi' }));
    a.start();
    stopApp();
    expect(rt().running).toBe(false);
    fireClick(btn.id);
    await settle();
    expect(toasts()).toEqual([]);
  });

  it('shows a broken block’s error and remembers which block it was', async () => {
    const a = app();
    const btn = a.el('button', 'Go');
    const broken = a.node('action.setText', {});
    a.chain(a.node('event.click', { element: btn.id }), broken);
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().error?.nodeId).toBe(broken));
    expect(rt().toasts.at(-1)?.kind).toBe('error');
  });
});

describe('events and elements', () => {
  it('a click changes a button’s label with Set text, and a text’s text', async () => {
    const a = app();
    const btn = a.el('button', 'Go', { label: 'Go' });
    const title = a.el('text', 'Title');
    const click = a.node('event.click', { element: btn.id });
    const setLabel = a.node('action.setText', { element: btn.id, text: 'Gone' });
    const setTitle = a.node('action.setText', { element: title.id, text: 'Clicked' });
    a.chain(click, setLabel, setTitle);
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().elements[title.id]).toEqual({ text: 'Clicked' }));
    expect(rt().elements[btn.id]).toEqual({ label: 'Gone' });
  });

  it('a click in a List card passes on the card’s item', async () => {
    const a = app();
    const list = a.el('list', 'People');
    const btn = a.el('button', 'Pick', {}, list);
    const picked = a.variable('picked', 'text', '');
    const click = a.node('event.click', { element: btn.id });
    const set = a.node('action.setVariable', { variable: picked });
    a.exec(click, set);
    a.data(click, 'item', set, 'value');
    a.start();
    fireClick(btn.id, { item: 'Ada', index: 0 });
    await vi.waitFor(() => expect(rt().vars[picked]).toBe('Ada'));
  });

  it('reads what was typed, and the starting value before that', async () => {
    const a = app();
    const box = a.el('input', 'Name', { value: 'Bob' });
    const seen = a.variable('seen', 'text', '');
    const change = a.node('event.inputChange', { element: box.id });
    const set = a.node('action.setVariable', { variable: seen });
    const read = a.node('data.getInputValue', { element: box.id });
    a.exec(change, set);
    a.data(read, 'value', set, 'value');
    a.start();

    fireChange(box.id, 'Bob');
    await vi.waitFor(() => expect(rt().vars[seen]).toBe('Bob'));
    useRuntimeStore.setState({ elements: { [box.id]: { value: 'Ada' } } });
    fireChange(box.id, 'Ada');
    await vi.waitFor(() => expect(rt().vars[seen]).toBe('Ada'));
  });

  it('reads a checkbox from what was ticked, a linked variable, or its setting', async () => {
    const a = app();
    const on = a.variable('on', 'boolean', true);
    const linked = a.el('checkbox', 'Linked');
    linked.props.checked = { kind: 'variable', variableId: on };
    const fixed = a.el('checkbox', 'Fixed', { checked: true });
    const btn = a.el('button', 'Go');
    const out1 = a.variable('out1', 'boolean', false);
    const out2 = a.variable('out2', 'boolean', false);
    const click = a.node('event.click', { element: btn.id });
    const set1 = a.node('action.setVariable', { variable: out1 });
    const set2 = a.node('action.setVariable', { variable: out2 });
    a.chain(click, set1, set2);
    a.data(a.node('data.getInputValue', { element: linked.id }), 'value', set1, 'value');
    a.data(a.node('data.getInputValue', { element: fixed.id }), 'value', set2, 'value');
    a.start();

    fireClick(btn.id);
    await vi.waitFor(() => expect([rt().vars[out1], rt().vars[out2]]).toEqual([true, true]));
    useRuntimeStore.setState({ elements: { [fixed.id]: { checked: false } } });
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().vars[out2]).toBe(false));
  });

  it('keeps a number box and a slider within their limits, whichever way they are set', async () => {
    const a = app();
    const slider = a.el('slider', 'Volume', { min: 0, max: 10, step: 1, value: 5 });
    const btn = a.el('button', 'Go');
    const read = a.variable('read', 'number', 0);
    const click = a.node('event.click', { element: btn.id });
    const set = a.node('action.setInputValue', { element: slider.id, value: '42' });
    const keep = a.node('action.setVariable', { variable: read });
    a.chain(click, set, keep);
    a.data(a.node('data.getInputValue', { element: slider.id }), 'value', keep, 'value');
    a.start();

    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().vars[read]).toBe(10));
    expect(rt().elements[slider.id]).toEqual({ value: 10 });
  });

  it('runs a List’s delete event with the item and where it was', async () => {
    const a = app();
    const list = a.el('list', 'People');
    const gone = a.variable('gone', 'text', '');
    const del = a.node('event.listDelete', { element: list.id });
    const set = a.node('action.setVariable', { variable: gone });
    a.exec(del, set);
    a.data(del, 'item', set, 'value');
    a.start();
    fireListDelete(list.id, 1, 'Bob');
    await vi.waitFor(() => expect(rt().vars[gone]).toBe('Bob'));
  });
});

describe('screens', () => {
  it('goes to a screen, runs its blocks, and goes back', async () => {
    const a = app();
    const details = makeScreen('Details');
    a.p.screens.push(details);
    const btn = a.el('button', 'Open');
    const back = a.el('button', 'Back', {}, details.root);
    a.chain(a.node('event.click', { element: btn.id }), a.node('action.goToScreen', { screen: details.id }));
    a.chain(a.node('event.screenLoad', { screen: details.id }), a.node('action.toast', { message: 'Details opened' }));
    a.chain(a.node('event.click', { element: back.id }), a.node('action.goBack'));
    a.start();

    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().screenId).toBe(details.id));
    expect(rt().history).toEqual([a.home.id]);
    await vi.waitFor(() => expect(toasts()).toEqual(['Details opened']));
    fireClick(back.id);
    await vi.waitFor(() => expect(rt().screenId).toBe(a.home.id));
    expect(rt().history).toEqual([]);
  });

  it('ignores a screen that no longer exists, and Go back on the first screen', async () => {
    const a = app();
    const btn = a.el('button', 'Go');
    a.chain(a.node('event.click', { element: btn.id }), a.node('action.goToScreen', { screen: 'gone' }), a.node('action.goBack'));
    a.start();
    fireClick(btn.id);
    await settle();
    expect(rt().screenId).toBe(a.home.id);
    expect(rt().history).toEqual([]);
  });
});

describe('timers and waits', () => {
  it('runs an “Every few seconds” block until the app stops', async () => {
    vi.useFakeTimers();
    const a = app();
    const n = a.variable('n', 'number', 0);
    a.chain(a.node('event.timer', { seconds: 2 }), a.node('action.changeVariable', { variable: n, amount: 1 }));
    a.start();
    await vi.advanceTimersByTimeAsync(6100);
    expect(rt().vars[n]).toBe(3);
    stopApp();
    await vi.advanceTimersByTimeAsync(6000);
    expect(rt().vars[n]).toBeUndefined();
  });

  it('a Wait delays what comes after it, and Stop cancels it', async () => {
    vi.useFakeTimers();
    const a = app();
    const btn = a.el('button', 'Go');
    a.chain(a.node('event.click', { element: btn.id }), a.node('action.wait', { seconds: 3 }), a.node('action.toast', { message: 'Done' }));
    a.start();

    fireClick(btn.id);
    await vi.advanceTimersByTimeAsync(2900);
    expect(toasts()).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(toasts()).toEqual(['Done']);

    fireClick(btn.id);
    await vi.advanceTimersByTimeAsync(1000);
    stopApp();
    await vi.advanceTimersByTimeAsync(5000);
    expect(toasts()).toEqual([]);
    // Stopping isn't an error.
    expect(rt().error).toBeNull();
  });

  it('collects the values on wires and shows them a moment later', async () => {
    vi.useFakeTimers();
    const a = app();
    const btn = a.el('button', 'Go');
    const msg = a.node('data.text', { value: 'Hi' });
    const toast = a.node('action.toast');
    a.chain(a.node('event.click', { element: btn.id }), toast);
    a.data(msg, 'value', toast, 'message');
    const wire = a.p.graph.edges.at(-1)!.id;
    a.start();
    fireClick(btn.id);
    fireClick(btn.id);
    await vi.advanceTimersByTimeAsync(10);
    expect(rt().wires[wire]).toBeUndefined();
    await vi.advanceTimersByTimeAsync(60);
    expect(rt().wires[wire]).toEqual({ value: 'Hi', n: 1 });
  });
});

describe('saving on the device', () => {
  it('saves and loads values under the project’s own names', async () => {
    const a = app();
    const btn = a.el('button', 'Go');
    const found = a.variable('found', 'boolean', false);
    const got = a.variable('got', 'list', []);
    const save = a.node('action.saveStorage', { key: 'scores' });
    const load = a.node('action.loadStorage', { key: 'scores' });
    const set1 = a.node('action.setVariable', { variable: got });
    const set2 = a.node('action.setVariable', { variable: found });
    a.chain(a.node('event.click', { element: btn.id }), save, load, set1, set2);
    a.data(a.node('data.getVariable', { variable: got }), 'value', save, 'value');
    a.data(load, 'value', set1, 'value');
    a.data(load, 'found', set2, 'value');
    a.p.variables.find((v) => v.id === got)!.initial = [1, 2];
    a.start();

    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().vars[found]).toBe(true));
    expect(localStorage.getItem(`cb.app.${a.p.id}.scores`)).toBe('[1,2]');
    expect(rt().vars[got]).toEqual([1, 2]);
  });

  it('reads text saved by older versions as it is, and says when nothing is saved', async () => {
    const a = app();
    const btn = a.el('button', 'Go');
    const found = a.variable('found', 'boolean', true);
    const got = a.variable('got', 'text', '');
    const load = a.node('action.loadStorage', { key: 'old' });
    const load2 = a.node('action.loadStorage', { key: 'missing' });
    const set1 = a.node('action.setVariable', { variable: got });
    const set2 = a.node('action.setVariable', { variable: found });
    a.chain(a.node('event.click', { element: btn.id }), load, set1, load2, set2);
    a.data(load, 'value', set1, 'value');
    a.data(load2, 'found', set2, 'value');
    localStorage.setItem(`cb.app.${a.p.id}.old`, 'not json');
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().vars[found]).toBe(false));
    expect(rt().vars[got]).toBe('not json');
  });
});

describe('tables', () => {
  const table = { id: 't1', name: 'Guests', columns: [{ id: 'c1', name: 'name', type: 'text' as const }] };

  function tableApp(blockType: string, config: Record<string, unknown> = {}) {
    const a = app();
    a.p.tables.push(table);
    const btn = a.el('button', 'Go');
    const out = a.variable('out', 'text', '');
    const block = a.node(blockType, { table: table.id, ...config });
    const set = a.node('action.setVariable', { variable: out });
    a.chain(a.node('event.click', { element: btn.id }), block, set);
    return { a, btn, out, block, set };
  }

  it('loads every page of a table’s rows', async () => {
    const { a, btn, out, block, set } = tableApp('table.query');
    a.data(block, 'count', set, 'value');
    vi.mocked(listRows)
      .mockResolvedValueOnce({ rows: [{ id: 1, values: { c1: 'Ada' } }], total: 2 })
      .mockResolvedValueOnce({ rows: [{ id: 2, values: { c1: 'Bob' } }], total: 2 });
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().vars[out]).toBe('2'));
    expect(listRows).toHaveBeenNthCalledWith(1, a.p.id, 't1', 0, 500);
    expect(listRows).toHaveBeenNthCalledWith(2, a.p.id, 't1', 1, 500);
  });

  it('adds a row', async () => {
    const { a, btn, out, block, set } = tableApp('table.add');
    a.data(block, 'id', set, 'value');
    vi.mocked(addRow).mockResolvedValue({ id: 7, values: {} });
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().vars[out]).toBe('7'));
  });

  it('a row that is gone is “not found” when updated or deleted', async () => {
    const { a, btn, out, block, set } = tableApp('table.update', { rowId: 3 });
    const del = a.node('table.delete', { table: table.id, rowId: 3 });
    const found2 = a.variable('found2', 'boolean', true);
    const set2 = a.node('action.setVariable', { variable: found2 });
    a.chain(set, del, set2);
    a.data(block, 'found', set, 'value');
    a.data(del, 'found', set2, 'value');
    vi.mocked(updateRow).mockRejectedValue(new ApiError('No such row.', 404));
    vi.mocked(deleteRow).mockRejectedValue(new ApiError('No such row.', 404));
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().vars[found2]).toBe(false));
    expect(rt().vars[out]).toBe('false');
  });

  it('shows other server problems as the block’s error', async () => {
    const { a, btn, block } = tableApp('table.delete', { rowId: 3 });
    vi.mocked(deleteRow).mockRejectedValue(new ApiError('The server had a problem.', 500));
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().error).toEqual({ nodeId: block, message: 'The server had a problem.' }));
  });

  it('in a published app, reads and adds rows through its link, and can’t change them', async () => {
    runAsPublished('my-app');
    const { a, btn, out, block, set } = tableApp('table.query');
    a.data(block, 'count', set, 'value');
    const add = a.node('table.add', { table: table.id });
    const update = a.node('table.update', { table: table.id, rowId: 1 });
    a.chain(set, add, update);
    vi.mocked(listPublishedRows).mockResolvedValue({ rows: [{ id: 1, values: { c1: 'Ada' } }], total: 1 });
    vi.mocked(addPublishedRow).mockResolvedValue({ id: 2, values: {} });
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().error).toEqual({ nodeId: update, message: READ_ONLY_TABLES }));
    expect(rt().vars[out]).toBe('1');
    expect(listPublishedRows).toHaveBeenCalledWith('my-app', 't1', 0, 500);
    expect(addPublishedRow).toHaveBeenCalledWith('my-app', 't1', {});
    expect(listRows).not.toHaveBeenCalled();
  });
});

describe('the server', () => {
  it('sends a form, shows its messages, and passes on the reply', async () => {
    const a = app();
    const btn = a.el('button', 'Go');
    const out = a.variable('out', 'text', '');
    const send = a.node('server.sendForm', { form: 'signup' });
    const set = a.node('action.setVariable', { variable: out });
    a.chain(a.node('event.click', { element: btn.id }), send, set);
    a.data(send, 'reply', set, 'value');
    vi.mocked(sendForm).mockResolvedValue({ ok: true, reply: 'Thanks', messages: ['Saved'] });
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().vars[out]).toBe('Thanks'));
    expect(toasts()).toEqual(['Saved']);
    expect(sendForm).toHaveBeenCalledWith(a.p.id, 'signup', {});
  });

  it('says which form’s workflow stopped, and why', async () => {
    const a = app();
    const btn = a.el('button', 'Go');
    const send = a.node('server.sendForm', { form: 'signup' });
    a.chain(a.node('event.click', { element: btn.id }), send);
    vi.mocked(sendForm).mockResolvedValue({ ok: false, messages: [], error: { message: 'No email.' } } as never);
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() =>
      expect(rt().error).toEqual({ nodeId: send, message: 'The server workflow for form “signup” stopped: No email.' }),
    );
  });

  it('fetches through the server when asked, but not in a published app', async () => {
    const a = app();
    const btn = a.el('button', 'Go');
    const out = a.variable('out', 'text', '');
    const fetchBlock = a.node('action.fetch', { url: 'https://example.com', via: 'server' });
    const set = a.node('action.setVariable', { variable: out });
    a.chain(a.node('event.click', { element: btn.id }), fetchBlock, set);
    a.data(fetchBlock, 'result', set, 'value');
    a.exec(fetchBlock, a.node('action.toast', { message: 'Failed' }), 'failed');
    vi.mocked(fetchViaServer).mockResolvedValue({ status: 200, statusText: 'OK', text: 'hello' });
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(rt().vars[out]).toBe('hello'));

    stopApp();
    runAsPublished('my-app');
    a.start();
    fireClick(btn.id);
    await vi.waitFor(() => expect(toasts()).toContain('Failed'));
    expect(fetchViaServer).toHaveBeenCalledTimes(1);
  });
});
