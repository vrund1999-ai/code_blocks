// The server's HTTP routes. Kept apart from main.ts so tests can call them
// with app.request() without opening a port.

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { authRoutes, canUseProject, loadUser, requireUser, type AuthEnv } from './authRoutes';
import { fetchRoutes } from './fetchRoutes';
import { rowRoutes } from './rowRoutes';
import { SqliteRowStore, type RowStore } from './rows';
import { runGraph } from './run';
import { MemoryStore, type KeyValueStore } from './store';
import { parseRunRequest } from './validate';
import { openDatabase } from './db';
import { SqliteDeployments } from './deployments';
import { secretRoutes } from './secretRoutes';
import { SqliteSecrets, type SecretStore } from './secrets';
import { SqliteUsers } from './users';
import { hookRoutes, workflowRoutes } from './workflowRoutes';
import { Workflows } from './workflows';

/** The biggest run request accepted. */
export const MAX_BODY_BYTES = 1024 * 1024;

export interface AppOptions {
  store?: KeyValueStore;
  /** Data table rows. Defaults to a database in memory. */
  rows?: RowStore;
  /** Secrets such as API keys. Defaults to a database in memory. */
  secrets?: SecretStore;
  /** Deployed projects and their triggers. Defaults to one with nothing deployed, without schedules. */
  workflows?: Workflows;
  /** Accounts and sign-in. Defaults to a database in memory. */
  users?: SqliteUsers;
  timeLimitMs?: number;
}

const problem = (message: string) => ({ error: { message } });
const PROJECT_ID = /^[\w-]{1,64}$/;

export function createApp(opts: AppOptions = {}) {
  const store = opts.store ?? new MemoryStore();
  const rows = opts.rows ?? new SqliteRowStore(':memory:');
  const secrets = opts.secrets ?? new SqliteSecrets(openDatabase(':memory:'));
  const workflows =
    opts.workflows ??
    new Workflows({ deployments: new SqliteDeployments(openDatabase(':memory:')), store, rows, secrets, timeLimitMs: opts.timeLimitMs });
  const users = opts.users ?? new SqliteUsers(openDatabase(':memory:'));
  const app = new Hono<AuthEnv>().basePath('/api');

  app.use('*', loadUser(users));
  // Pages on other sites can't send forms here with the person's cookie.
  app.use('/auth/*', csrf());
  app.use('/projects/*', csrf());
  app.use('/run', csrf(), requireUser);
  app.use('/fetch', csrf(), requireUser);

  // A project's routes are for the account it belongs to. Its forms stay
  // open, like its web addresses (/api/hooks), since they're how apps reach
  // its server workflows.
  app.use('/projects/:projectId/*', async (c, next) => {
    if (c.req.method === 'POST' && /^\/api\/projects\/[^/]+\/forms\//.test(c.req.path)) return next();
    if (!PROJECT_ID.test(c.req.param('projectId'))) return c.json(problem('That project id is not valid.'), 400);
    const refused = canUseProject(c, users, c.req.param('projectId'));
    if (refused) return refused;
    await next();
  });

  app.route('/auth', authRoutes(users));
  app.route('/projects', rowRoutes(rows));
  app.route('/projects', workflowRoutes(workflows));
  app.route('/projects', secretRoutes(secrets));
  app.route('/hooks', hookRoutes(workflows));
  app.route('/fetch', fetchRoutes());

  app.get('/health', (c) => c.json({ ok: true }));

  // Runs one event block of a graph and returns what happened. The graph,
  // its variables and what the event carries come with the request. The
  // editor uses it to try server workflows without deploying them.
  app.post(
    '/run',
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json(problem('The request is too big (over 1 MB).'), 413) }),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(problem('The request body must be JSON.'), 400);
      }
      const req = parseRunRequest(body);
      if (typeof req === 'string') return c.json(problem(req), 400);
      // Runs can read the project's secrets and rows, so it has to be theirs.
      const refused = canUseProject(c, users, req.projectId);
      if (refused) return refused;
      return c.json(await runGraph(req, { store, rows, secrets, timeLimitMs: opts.timeLimitMs, replies: req.replies }));
    },
  );

  app.notFound((c) => c.json(problem('Not found.'), 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException && err.status === 403) {
      return c.json(problem('This request came from another site, so it was refused.'), 403);
    }
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json(problem('Something went wrong on the server.'), 500);
  });
  return app;
}
