// Projects saved to the signed-in account:
//   GET    /api/projects              { projects: [{ id, name, version, updatedAt }] }
//   GET    /api/projects/:projectId   { project, version, updatedAt }
//   PUT    /api/projects/:projectId   { project, baseVersion }  → { version, updatedAt }
//   DELETE /api/projects/:projectId   deletes the saved copy and stops its server workflows
// app.ts checks that the project is the account's before these run.

import { parseProject, ProjectFormatError } from '@code-blocks/engine/project';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AuthEnv } from './authRoutes';
import type { SqliteProjects } from './projects';
import type { Workflows } from './workflows';

/** The biggest project accepted. */
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

export const NOT_SAVED = 'This project isn’t saved to your account.';
export const CHANGED_ELSEWHERE = 'This project was changed in another tab or browser after you opened it here.';

const problem = (message: string) => ({ error: { message } });

/** The body of a save, or a message saying what's wrong. */
function parseSave(body: unknown, projectId: string): { project: ReturnType<typeof parseProject>; base: number | null | 'any' } | string {
  if (typeof body !== 'object' || body === null) return 'Send { project, baseVersion } as JSON.';
  const { project, baseVersion } = body as Record<string, unknown>;
  const base = baseVersion === undefined ? null : baseVersion;
  if (!(base === null || base === 'any' || (typeof base === 'number' && Number.isSafeInteger(base) && base > 0))) {
    return '"baseVersion" must be the version the project was opened at, null for a new project, or "any".';
  }
  let parsed;
  try {
    parsed = parseProject(project);
  } catch (err) {
    if (err instanceof ProjectFormatError) return `The project can’t be saved. ${err.message}`;
    throw err;
  }
  if (parsed.id !== projectId) return 'The project’s id doesn’t match the address it was sent to.';
  return { project: parsed, base };
}

export function projectRoutes(projects: SqliteProjects, workflows: Workflows) {
  const app = new Hono<AuthEnv>();

  app.get('/', (c) => c.json({ projects: projects.list(c.get('user')!.id) }));

  app.get('/:projectId', (c) => {
    const saved = projects.get(c.req.param('projectId'));
    if (!saved) return c.json(problem(NOT_SAVED), 404);
    return c.json({ project: saved.project, version: saved.version, updatedAt: saved.updatedAt });
  });

  app.put(
    '/:projectId',
    bodyLimit({ maxSize: MAX_PROJECT_BYTES, onError: (c) => c.json(problem('The project is too big to save (over 2 MB).'), 413) }),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(problem('The request body must be JSON.'), 400);
      }
      const req = parseSave(body, c.req.param('projectId'));
      if (typeof req === 'string') return c.json(problem(req), 400);
      const result = projects.save(c.get('user')!.id, req.project, req.base);
      if (!result.ok) return c.json({ ...problem(CHANGED_ELSEWHERE), current: result.current }, 409);
      return c.json({ version: result.saved.version, updatedAt: result.saved.updatedAt });
    },
  );

  // Its table rows and secrets stay with the account, in case it's opened from a file again.
  app.delete('/:projectId', (c) => {
    const id = c.req.param('projectId');
    workflows.undeploy(id);
    return projects.remove(id) ? c.json({ ok: true }) : c.json(problem(NOT_SAVED), 404);
  });

  return app;
}
