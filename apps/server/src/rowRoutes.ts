// Routes for the rows of a project's data tables:
//   GET    /api/projects/:projectId/tables/:tableId/rows?limit=&offset=
//   POST   /api/projects/:projectId/tables/:tableId/rows          { values }
//   PATCH  /api/projects/:projectId/tables/:tableId/rows/:rowId   { values }
//   DELETE /api/projects/:projectId/tables/:tableId/rows/:rowId

import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { CellValue, RowStore } from './rows';

/** The biggest row change accepted. */
export const MAX_ROW_BYTES = 64 * 1024;
/** Longest text a cell may hold. */
export const MAX_CELL_TEXT = 10_000;
/** Most cells a request may set. */
export const MAX_CELLS = 200;

/** Project, table and column ids are short ids made by the editor. */
const ID = /^[\w-]{1,64}$/;

const problem = (message: string) => ({ error: { message } });

/** The cell values of a request body, or a message saying what is wrong. */
export function parseValues(body: unknown): Record<string, CellValue> | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'Send a JSON object.';
  const { values } = body as { values?: unknown };
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    return '"values" must be an object of cell values by column id.';
  }
  const entries = Object.entries(values);
  if (entries.length > MAX_CELLS) return `A row can have at most ${MAX_CELLS} cells.`;
  for (const [key, v] of entries) {
    if (!ID.test(key)) return `"${key.slice(0, 64)}" is not a column id.`;
    const ok =
      v === null ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v)) ||
      (typeof v === 'string' && v.length <= MAX_CELL_TEXT);
    if (!ok) return `The value for "${key}" must be text (up to ${MAX_CELL_TEXT} characters), a number, true/false or null.`;
  }
  return values as Record<string, CellValue>;
}

async function readValues(c: Context) {
  try {
    return parseValues(await c.req.json());
  } catch {
    return 'The request body must be JSON.';
  }
}

export function rowRoutes(rows: RowStore) {
  const app = new Hono();
  const limit = bodyLimit({
    maxSize: MAX_ROW_BYTES,
    onError: (c) => c.json(problem('The row is too big (over 64 KB).'), 413),
  });

  // Check the ids in the path once for every route.
  app.use('/:projectId/tables/:tableId/*', async (c, next) => {
    const { projectId, tableId } = c.req.param();
    if (!ID.test(projectId) || !ID.test(tableId)) return c.json(problem('That project or table id is not valid.'), 400);
    await next();
  });

  const rowId = (c: Context) => {
    const n = Number(c.req.param('rowId'));
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };

  app.get('/:projectId/tables/:tableId/rows', (c) => {
    const { projectId, tableId } = c.req.param();
    const num = (name: string) => {
      const raw = c.req.query(name);
      return raw === undefined || raw === '' ? undefined : Math.floor(Number(raw)) || 0;
    };
    return c.json(rows.list(projectId, tableId, { limit: num('limit'), offset: num('offset') }));
  });

  app.post('/:projectId/tables/:tableId/rows', limit, async (c) => {
    const values = await readValues(c);
    if (typeof values === 'string') return c.json(problem(values), 400);
    const { projectId, tableId } = c.req.param();
    return c.json(rows.add(projectId, tableId, values), 201);
  });

  app.patch('/:projectId/tables/:tableId/rows/:rowId', limit, async (c) => {
    const id = rowId(c);
    if (id === null) return c.json(problem('Row ids are whole numbers from 1.'), 400);
    const values = await readValues(c);
    if (typeof values === 'string') return c.json(problem(values), 400);
    const { projectId, tableId } = c.req.param();
    const row = rows.update(projectId, tableId, id, values);
    return row ? c.json(row) : c.json(problem(`There is no row ${id}.`), 404);
  });

  app.delete('/:projectId/tables/:tableId/rows/:rowId', (c) => {
    const id = rowId(c);
    if (id === null) return c.json(problem('Row ids are whole numbers from 1.'), 400);
    const { projectId, tableId } = c.req.param();
    return rows.remove(projectId, tableId, id) ? c.json({ ok: true }) : c.json(problem(`There is no row ${id}.`), 404);
  });

  return app;
}
