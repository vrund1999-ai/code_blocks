// Publishing a project to a link anyone can open:
//   GET    /api/projects/:projectId/publication   { published: false }, or { published: true, slug, publishedAt, fingerprint }
//   PUT    /api/projects/:projectId/publication   { project, fingerprint }: publishes, keeping the link
//   DELETE /api/projects/:projectId/publication   takes the app off its link
// and what anyone with the link may ask, without signing in:
//   GET    /api/published/:slug                       { project, publishedAt }
//   GET    /api/published/:slug/tables/:tableId/rows  the table's rows, unless only adding is allowed
//   POST   /api/published/:slug/tables/:tableId/rows  { values }: adds a row, if the table allows it
// What each table allows is its `visitors` setting in the published copy.

import { parseProject, ProjectFormatError } from '@code-blocks/engine/project';
import { cellValue, visitorsCanAdd, visitorsCanRead, type CellValue, type DataTable } from '@code-blocks/engine/tables';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { tooMany, type RateLimiter } from './limits';
import { MAX_PROJECT_BYTES } from './projectRoutes';
import type { Publication } from './publications';
import type { SqlitePublications } from './publications';
import { MAX_ROW_BYTES, parseValues } from './rowRoutes';
import type { RowStore } from './rows';

export const NOT_PUBLISHED = 'This app isn’t published. Check the link, or ask whoever shared it.';
export const NO_SUCH_TABLE = 'This app has no such table.';
export const ROWS_HIDDEN = 'Visitors can add rows to this table, but not see them.';
export const NO_ADDING = 'Visitors can’t add rows to this table. Its owner can allow it in the Data tab.';
export const TOO_MANY_ROWS = 'Visitors added too many rows to this app.';

const problem = (message: string) => ({ error: { message } });
const ID = /^[\w-]{1,64}$/;

/** Routes for the project's owner (app.ts checks who that is). */
export function publishRoutes(publications: SqlitePublications) {
  const app = new Hono();

  app.get('/:projectId/publication', (c) => {
    const found = publications.forProject(c.req.param('projectId'));
    return c.json(found ? { published: true, ...found } : { published: false });
  });

  app.put(
    '/:projectId/publication',
    bodyLimit({ maxSize: MAX_PROJECT_BYTES, onError: (c) => c.json(problem('The project is too big to publish (over 2 MB).'), 413) }),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(problem('The request body must be JSON.'), 400);
      }
      const { project, fingerprint } = (body ?? {}) as Record<string, unknown>;
      if (typeof fingerprint !== 'string' || fingerprint.length > 100) return c.json(problem('Send { project, fingerprint }.'), 400);
      let parsed;
      try {
        parsed = parseProject(project);
      } catch (err) {
        if (err instanceof ProjectFormatError) return c.json(problem(`The project can’t be published. ${err.message}`), 400);
        throw err;
      }
      if (parsed.id !== c.req.param('projectId')) {
        return c.json(problem('The project’s id doesn’t match the address it was sent to.'), 400);
      }
      return c.json({ published: true, ...publications.publish(parsed, fingerprint) });
    },
  );

  app.delete('/:projectId/publication', (c) =>
    publications.unpublish(c.req.param('projectId')) ? c.json({ ok: true }) : c.json(problem(NOT_PUBLISHED), 404),
  );

  return app;
}

/** The cells a visitor's row sets: only the table's columns, each as its column's kind. */
function visitorValues(table: DataTable, values: Record<string, CellValue>): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  for (const col of table.columns) if (col.id in values) out[col.id] = cellValue(col.type, values[col.id]);
  return out;
}

/**
 * Routes for visitors of a published app. Each table says whether they may
 * read its rows, add rows, or both; changing and deleting rows is for its
 * owner. `adds` limits how many rows visitors add, per project.
 */
export function publishedRoutes(publications: SqlitePublications, rows: RowStore, adds?: RateLimiter) {
  const app = new Hono();

  app.get('/:slug', (c) => {
    const pub = publications.get(c.req.param('slug'));
    if (!pub) return c.json(problem(NOT_PUBLISHED), 404);
    return c.json({ project: pub.project, publishedAt: pub.publishedAt });
  });

  /** The published app and one of its tables, or the answer saying why not. */
  const tableOf = (c: Context): { pub: Publication; table: DataTable } | Response => {
    const pub = publications.get(c.req.param('slug') ?? '');
    if (!pub) return c.json(problem(NOT_PUBLISHED), 404);
    const tableId = c.req.param('tableId') ?? '';
    // Only the tables of the published copy.
    const table = ID.test(tableId) ? pub.project.tables.find((t) => t.id === tableId) : undefined;
    return table ? { pub, table } : c.json(problem(NO_SUCH_TABLE), 404);
  };

  app.get('/:slug/tables/:tableId/rows', (c) => {
    const found = tableOf(c);
    if (found instanceof Response) return found;
    if (!visitorsCanRead(found.table)) return c.json(problem(ROWS_HIDDEN), 403);
    const num = (name: string) => {
      const raw = c.req.query(name);
      return raw === undefined || raw === '' ? undefined : Math.floor(Number(raw)) || 0;
    };
    return c.json(rows.list(found.pub.projectId, found.table.id, { limit: num('limit'), offset: num('offset') }));
  });

  app.post(
    '/:slug/tables/:tableId/rows',
    bodyLimit({ maxSize: MAX_ROW_BYTES, onError: (c) => c.json(problem('The row is too big (over 64 KB).'), 413) }),
    async (c) => {
      const found = tableOf(c);
      if (found instanceof Response) return found;
      const { pub, table } = found;
      if (!visitorsCanAdd(table)) return c.json(problem(NO_ADDING), 403);
      let values;
      try {
        values = parseValues(await c.req.json());
      } catch {
        values = 'The request body must be JSON.';
      }
      if (typeof values === 'string') return c.json(problem(values), 400);
      // Counted per project, like its web addresses and forms, after the checks above.
      const wait = adds?.take(pub.projectId);
      if (wait) return tooMany(c, wait, TOO_MANY_ROWS);
      return c.json(rows.add(pub.projectId, table.id, visitorValues(table, values)), 201);
    },
  );

  return app;
}
