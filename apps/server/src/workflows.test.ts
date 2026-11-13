import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { openDatabase } from './db';
import { SqliteDeployments } from './deployments';
import { SqliteRowStore } from './rows';
import { MemoryStore, SqliteStore } from './store';
import { data, exec, node } from './testGraph';
import { MAX_HISTORY, Workflows } from './workflows';

function setup() {
  const db = openDatabase(':memory:');
  const rows = new SqliteRowStore(db);
  const store = new MemoryStore();
  const workflows = new Workflows({ deployments: new SqliteDeployments(db), store, rows });
  const app = createApp({ rows, store, workflows });
  const send = (method: string, path: string, body?: unknown, type = 'application/json') =>
    app.request(path, {
      method,
      headers: { 'Content-Type': type },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { db, rows, store, workflows, app, send };
}

afterEach(() => {
  vi.useRealTimers();
});

const deployUrl = '/api/projects/p1/deployment';

/** A project that answers at /orders, takes a "signup" form, and counts on a schedule. */
const project = {
  name: 'Shop',
  fingerprint: 'abc',
  variables: [{ id: 'count', type: 'number', initial: 0 }],
  tables: [{ id: 'orders', name: 'Orders', columns: [{ id: 'c_item', name: 'Item', type: 'text' }] }],
  graph: {
    nodes: [
      // POST /orders: add the posted record as a row, then reply with its id.
      node('hook', 'server.http', { path: 'Orders', method: 'POST' }),
      node('add', 'table.add', { table: 'orders' }),
      node('reply', 'server.reply', { status: 201 }),
      // GET /orders: reply with every row.
      node('list', 'server.http', { path: 'orders', method: 'GET' }),
      node('rows', 'table.query', { table: 'orders' }),
      node('replyRows', 'server.reply'),
      // Form "signup": reply with a greeting and show a message.
      node('form', 'server.form', { form: 'Sign up' }),
      node('msg', 'action.toast', { message: 'Someone signed up' }),
      node('hello', 'data.join', { a: 'Welcome, ', b: '' }),
      node('pick', 'data.getField', { field: 'name' }),
      node('replyForm', 'server.reply'),
      // Every 15 minutes: add 1 to a saved count.
      node('tick', 'server.schedule', { every: 'minutes', amount: 15 }),
      node('load', 'action.loadStorage', { key: 'ticks' }),
      node('plus', 'data.math', { op: '+', b: 1 }),
      node('save', 'action.saveStorage', { key: 'ticks' }),
      // A web address with a name that isn't allowed.
      node('bad', 'server.http', { path: 'no spaces' }),
    ],
    edges: [
      exec('hook', 'add'),
      exec('add', 'reply'),
      data('hook', 'body', 'add', 'values'),
      data('add', 'id', 'reply', 'value'),
      exec('list', 'rows'),
      exec('rows', 'replyRows'),
      data('rows', 'rows', 'replyRows', 'value'),
      exec('form', 'msg'),
      exec('msg', 'replyForm'),
      data('form', 'values', 'pick', 'record'),
      data('pick', 'value', 'hello', 'b'),
      data('hello', 'value', 'replyForm', 'value'),
      exec('tick', 'load'),
      exec('load', 'save'),
      data('load', 'value', 'plus', 'a'),
      data('plus', 'value', 'save', 'value'),
    ],
  },
};

describe('deploying', () => {
  it('keeps a copy of the project and says what it answers to', async () => {
    const { send } = setup();
    expect((await send('GET', deployUrl)).status).toBe(404);

    const res = await send('PUT', deployUrl, project);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: 'Shop',
      fingerprint: 'abc',
      addresses: [
        { method: 'POST', path: 'orders' },
        { method: 'GET', path: 'orders' },
      ],
      forms: ['Sign up'],
      schedules: ['Every 15 minutes'],
      problems: [{ nodeId: 'bad', message: expect.stringMatching(/letters, numbers/) }],
    });
    expect(await (await send('GET', deployUrl)).json()).toMatchObject({ fingerprint: 'abc' });

    expect((await send('DELETE', deployUrl)).status).toBe(200);
    expect((await send('GET', deployUrl)).status).toBe(404);
    expect((await send('DELETE', deployUrl)).status).toBe(404);
  });

  it.each([
    ['not JSON', 'nope', 400, 'The request body must be JSON.'],
    ['no graph', { name: 'x' }, 400, /"graph" needs/],
    ['a bad name', { ...project, name: 5 }, 400, /"name" must be text/],
  ])('refuses %s', async (_, body, status, message) => {
    const res = await setup().send('PUT', deployUrl, body);
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(message);
  });

  it('keeps deployments and saved values in the database file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-deploy-'));
    try {
      const file = join(dir, 'server.db');
      const first = openDatabase(file);
      new SqliteDeployments(first).put({ ...project, projectId: 'p1', deployedAt: '2026-11-13T10:00:00.000Z' } as never);
      new SqliteStore(first).set('p1', 'ticks', 3);
      first.close();

      const second = openDatabase(file);
      expect(new SqliteDeployments(second).all().map((d) => d.name)).toEqual(['Shop']);
      expect(new SqliteStore(second).get('p1', 'ticks')).toBe(3);
      expect(new SqliteStore(second).get('p1', 'other')).toBeUndefined();
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('web addresses', () => {
  it('runs the workflow for the address and method, and sends its reply', async () => {
    const { send, rows } = setup();
    await send('PUT', deployUrl, project);

    const added = await send('POST', '/api/hooks/p1/orders/', { item: 'Tea' });
    expect(added.status).toBe(201);
    expect(await added.json()).toBe(1);
    expect(rows.list('p1', 'orders').rows).toEqual([{ id: 1, values: { c_item: 'Tea' } }]);

    // Form posts become records too.
    await send('POST', '/api/hooks/p1/ORDERS', 'item=Cake', 'application/x-www-form-urlencoded');
    const listed = await send('GET', '/api/hooks/p1/orders');
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([
      { id: 1, Item: 'Tea' },
      { id: 2, Item: 'Cake' },
    ]);
  });

  it('says when nothing answers', async () => {
    const { send } = setup();
    expect((await send('GET', '/api/hooks/p1/orders')).status).toBe(404);
    await send('PUT', deployUrl, project);
    const wrongMethod = await send('DELETE', '/api/hooks/p1/orders');
    expect(wrongMethod.status).toBe(404);
    expect(((await wrongMethod.json()) as { error: { message: string } }).error.message).toMatch(/Nothing answers DELETE \/orders/);
    expect((await send('GET', '/api/hooks/p1/no%20spaces')).status).toBe(404);
  });

  it('answers text as text, says ok without a Reply, and reports errors', async () => {
    const { send } = setup();
    await send('PUT', deployUrl, {
      graph: {
        nodes: [
          node('hi', 'server.http', { path: 'hi' }),
          node('r', 'server.reply', { value: 'Hello there' }),
          node('quiet', 'server.http', { path: 'quiet' }),
          node('broken', 'server.http', { path: 'broken' }),
          node('screen', 'action.setText'),
        ],
        edges: [exec('hi', 'r'), exec('broken', 'screen')],
      },
    });
    const hi = await send('GET', '/api/hooks/p1/hi');
    expect(hi.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await hi.text()).toBe('Hello there');
    expect(await (await send('GET', '/api/hooks/p1/quiet')).json()).toEqual({ ok: true });
    const broken = await send('GET', '/api/hooks/p1/broken');
    expect(broken.status).toBe(500);
    expect(((await broken.json()) as { error: { message: string } }).error.message).toMatch(/^The workflow stopped: /);
  });
});

describe('forms', () => {
  it('runs the form’s workflow and gives back its reply and messages', async () => {
    const { send, workflows } = setup();
    await send('PUT', deployUrl, project);
    const res = await send('POST', `/api/projects/p1/forms/${encodeURIComponent('sign UP')}`, { values: { name: 'Ada' } });
    expect(await res.json()).toEqual({ ok: true, messages: ['Someone signed up'], reply: 'Welcome, Ada' });

    const missing = await send('POST', '/api/projects/p1/forms/other', { values: {} });
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { message: string } }).error.message).toMatch(/no form “other”/);
    expect((await send('POST', '/api/projects/p1/forms/x', { values: [] })).status).toBe(400);

    expect(workflows.runs('p1')).toEqual([
      { at: expect.any(String), trigger: 'Form “sign UP”', ok: true, messages: ['Someone signed up'] },
    ]);
  });
});

describe('schedules', () => {
  it('run at their times while the server is running, and stop when undeployed', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 13, 10, 7) });
    const { workflows, store } = setup();
    workflows.start();
    workflows.deploy('p1', project as never);

    await vi.advanceTimersByTimeAsync(7 * 60_000); // 10:14
    expect(store.get('p1', 'ticks')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(60_000); // 10:15
    expect(store.get('p1', 'ticks')).toBe(1);
    await vi.advanceTimersByTimeAsync(30 * 60_000); // 10:45
    expect(store.get('p1', 'ticks')).toBe(3);
    expect(workflows.runs('p1')[0]).toMatchObject({ trigger: 'Every 15 minutes', ok: true });

    workflows.undeploy('p1');
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(store.get('p1', 'ticks')).toBe(3);
    workflows.stop();
  });

  it('start again for projects deployed before the server restarted', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 13, 10, 0) });
    const db = openDatabase(':memory:');
    const deployments = new SqliteDeployments(db);
    const store = new MemoryStore();
    const rows = new SqliteRowStore(db);
    new Workflows({ deployments, store, rows }).deploy('p1', project as never); // not started: no timers
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(store.get('p1', 'ticks')).toBeUndefined();

    const restarted = new Workflows({ deployments, store, rows });
    restarted.start();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(store.get('p1', 'ticks')).toBe(1);
    restarted.stop();
  });

  it('keeps only the latest runs', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 13, 0, 0, 30) });
    const { workflows } = setup();
    workflows.start();
    workflows.deploy('p1', { ...project, graph: { nodes: [node('t', 'server.schedule', { every: 'minutes', amount: 1 })], edges: [] } } as never);
    await vi.advanceTimersByTimeAsync((MAX_HISTORY + 5) * 60_000);
    expect(workflows.runs('p1')).toHaveLength(MAX_HISTORY);
    workflows.stop();
  });
});
