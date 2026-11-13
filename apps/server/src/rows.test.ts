import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { MAX_CELL_TEXT } from './rowRoutes';
import { SqliteRowStore } from './rows';

const stores: SqliteRowStore[] = [];
const memory = () => {
  const s = new SqliteRowStore(':memory:');
  stores.push(s);
  return s;
};
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
});

describe('SqliteRowStore', () => {
  it('adds, lists, updates and removes rows, numbering them per table', () => {
    const s = memory();
    expect(s.add('p', 't', { a: 'Ada' })).toEqual({ id: 1, values: { a: 'Ada' } });
    s.add('p', 't', { a: 'Bo', b: 36 });
    s.add('p', 'other', { a: 'elsewhere' });
    s.add('p2', 't', { a: 'other project' });
    expect(s.list('p', 't')).toEqual({
      total: 2,
      rows: [
        { id: 1, values: { a: 'Ada' } },
        { id: 2, values: { a: 'Bo', b: 36 } },
      ],
    });
    expect(s.list('p', 'other').rows).toEqual([{ id: 1, values: { a: 'elsewhere' } }]);

    // Changing cells keeps the others.
    expect(s.update('p', 't', 2, { b: 37, c: true })).toEqual({ id: 2, values: { a: 'Bo', b: 37, c: true } });
    expect(s.update('p', 't', 9, { a: 'x' })).toBeNull();

    // A deleted row's number is not used again.
    expect(s.remove('p', 't', 2)).toBe(true);
    expect(s.remove('p', 't', 2)).toBe(false);
    expect(s.add('p', 't', {}).id).toBe(3);
  });

  it('pages through rows', () => {
    const s = memory();
    for (let i = 0; i < 5; i++) s.add('p', 't', { n: i });
    const page = s.list('p', 't', { limit: 2, offset: 2 });
    expect(page.total).toBe(5);
    expect(page.rows.map((r) => r.id)).toEqual([3, 4]);
  });

  it('keeps rows in a file between restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-rows-'));
    try {
      const file = join(dir, 'rows.db');
      const first = new SqliteRowStore(file);
      first.add('p', 't', { a: 'kept' });
      first.close();
      const second = new SqliteRowStore(file);
      expect(second.list('p', 't').rows).toEqual([{ id: 1, values: { a: 'kept' } }]);
      expect(second.add('p', 't', {}).id).toBe(2);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('row routes', () => {
  const base = '/api/projects/p1/tables/t1/rows';
  const send = (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('adds, lists, changes and deletes rows', async () => {
    const app = createApp({ rows: memory() });
    const added = await send(app, 'POST', base, { values: { c1: 'Ada', c2: 36, c3: true } });
    expect(added.status).toBe(201);
    expect(await added.json()).toEqual({ id: 1, values: { c1: 'Ada', c2: 36, c3: true } });
    await send(app, 'POST', base, { values: { c1: 'Bo' } });

    const changed = await send(app, 'PATCH', `${base}/1`, { values: { c2: null } });
    expect(await changed.json()).toEqual({ id: 1, values: { c1: 'Ada', c2: null, c3: true } });

    expect((await send(app, 'DELETE', `${base}/2`)).status).toBe(200);
    const list = await app.request(`${base}?limit=10&offset=0`);
    expect(await list.json()).toEqual({ total: 1, rows: [{ id: 1, values: { c1: 'Ada', c2: null, c3: true } }] });
  });

  it.each([
    ['not JSON', 'POST', base, 'nope', 400, 'The request body must be JSON.'],
    ['no values', 'POST', base, { cells: {} }, 400, /"values" must be an object/],
    ['a list value', 'POST', base, { values: { c1: [1] } }, 400, /must be text/],
    ['too much text', 'POST', base, { values: { c1: 'x'.repeat(MAX_CELL_TEXT + 1) } }, 400, /must be text/],
    ['a bad column id', 'POST', base, { values: { 'a b': 1 } }, 400, /is not a column id/],
    ['a bad table id', 'POST', '/api/projects/p1/tables/t%20x/rows', { values: {} }, 400, /not valid/],
    ['a bad row id', 'PATCH', `${base}/0`, { values: {} }, 400, /whole numbers/],
    ['a missing row', 'PATCH', `${base}/5`, { values: {} }, 404, 'There is no row 5.'],
    ['deleting a missing row', 'DELETE', `${base}/5`, undefined, 404, 'There is no row 5.'],
  ])('rejects %s', async (_, method, path, body, status, message) => {
    const res = await send(createApp({ rows: memory() }), method, path, body);
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(message);
  });

  it('rejects rows over the size limit', async () => {
    const values = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`c${i}`, 'x'.repeat(9000)]));
    const res = await send(createApp({ rows: memory() }), 'POST', base, { values });
    expect(res.status).toBe(413);
  });
});
