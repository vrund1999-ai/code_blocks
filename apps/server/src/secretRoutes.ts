// Routes for a project's secrets. Values go in, but never come back out:
//   GET    /api/projects/:projectId/secrets        { secrets: [{ name, updatedAt }] }
//   PUT    /api/projects/:projectId/secrets/:name  { value }: add or replace a secret
//   DELETE /api/projects/:projectId/secrets/:name

import { MIN_SECRET_LENGTH, SECRET_NAME, SECRET_NAME_PROBLEM } from '@code-blocks/engine/nodes/server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { SecretStore } from './secrets';

/** The longest secret value accepted. */
export const MAX_SECRET_LENGTH = 10_000;

const ID = /^[\w-]{1,64}$/;

const problem = (message: string) => ({ error: { message } });

export function secretRoutes(secrets: SecretStore) {
  const app = new Hono();

  app.use('/:projectId/secrets/*', async (c, next) => {
    if (!ID.test(c.req.param('projectId'))) return c.json(problem('That project id is not valid.'), 400);
    await next();
  });

  app.get('/:projectId/secrets', (c) => {
    const projectId = c.req.param('projectId');
    if (!ID.test(projectId)) return c.json(problem('That project id is not valid.'), 400);
    return c.json({ secrets: secrets.list(projectId) });
  });

  app.put(
    '/:projectId/secrets/:name',
    bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json(problem('The request is too big.'), 413) }),
    async (c) => {
      const name = c.req.param('name');
      if (!SECRET_NAME.test(name)) return c.json(problem(SECRET_NAME_PROBLEM), 400);
      let value: unknown;
      try {
        value = ((await c.req.json()) as { value?: unknown })?.value;
      } catch {
        return c.json(problem('Send the secret as JSON: { "value": "…" }.'), 400);
      }
      if (typeof value !== 'string') return c.json(problem('Send the secret as JSON: { "value": "…" }.'), 400);
      if (value.trim().length < MIN_SECRET_LENGTH) {
        return c.json(problem(`A secret must be at least ${MIN_SECRET_LENGTH} characters long.`), 400);
      }
      if (value.length > MAX_SECRET_LENGTH) {
        return c.json(problem(`A secret can be at most ${MAX_SECRET_LENGTH.toLocaleString('en')} characters long.`), 400);
      }
      return c.json(secrets.set(c.req.param('projectId'), name, value.trim()));
    },
  );

  app.delete('/:projectId/secrets/:name', (c) =>
    secrets.remove(c.req.param('projectId'), c.req.param('name'))
      ? c.json({ ok: true })
      : c.json(problem(`There’s no secret “${c.req.param('name')}”.`), 404),
  );

  return app;
}
