// Publishing a project to a link anyone can open:
//   GET    /api/projects/:projectId/publication   { published: false }, or { published: true, slug, publishedAt, fingerprint }
//   PUT    /api/projects/:projectId/publication   { project, fingerprint }: publishes, keeping the link
//   DELETE /api/projects/:projectId/publication   takes the app off its link
// and what anyone with the link may ask, without signing in:
//   GET    /api/published/:slug                       { project, publishedAt }
//   GET    /api/published/:slug/tables/:tableId/rows  the table's rows, read only

import { parseProject, ProjectFormatError } from '@code-blocks/engine/project';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { MAX_PROJECT_BYTES } from './projectRoutes';
import type { SqlitePublications } from './publications';
import type { RowStore } from './rows';

export const NOT_PUBLISHED = 'This app isn’t published. Check the link, or ask whoever shared it.';
export const NO_SUCH_TABLE = 'This app has no such table.';

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

/** Routes for visitors of a published app. Its table rows can be read, not changed. */
export function publishedRoutes(publications: SqlitePublications, rows: RowStore) {
  const app = new Hono();

  app.get('/:slug', (c) => {
    const pub = publications.get(c.req.param('slug'));
    if (!pub) return c.json(problem(NOT_PUBLISHED), 404);
    return c.json({ project: pub.project, publishedAt: pub.publishedAt });
  });

  app.get('/:slug/tables/:tableId/rows', (c) => {
    const pub = publications.get(c.req.param('slug'));
    if (!pub) return c.json(problem(NOT_PUBLISHED), 404);
    const tableId = c.req.param('tableId');
    // Only the tables of the published copy.
    if (!ID.test(tableId) || !pub.project.tables.some((t) => t.id === tableId)) return c.json(problem(NO_SUCH_TABLE), 404);
    const num = (name: string) => {
      const raw = c.req.query(name);
      return raw === undefined || raw === '' ? undefined : Math.floor(Number(raw)) || 0;
    };
    return c.json(rows.list(pub.projectId, tableId, { limit: num('limit'), offset: num('offset') }));
  });

  return app;
}
