// The server's HTTP routes. Kept apart from main.ts so tests can call them
// with app.request() without opening a port.

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { rowRoutes } from './rowRoutes';
import { SqliteRowStore, type RowStore } from './rows';
import { runGraph } from './run';
import { MemoryStore, type KeyValueStore } from './store';
import { parseRunRequest } from './validate';
import { openDatabase } from './db';
import { SqliteDeployments } from './deployments';
import { secretRoutes } from './secretRoutes';
import { SqliteSecrets, type SecretStore } from './secrets';
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
  timeLimitMs?: number;
}

const problem = (message: string) => ({ error: { message } });

export function createApp(opts: AppOptions = {}) {
  const store = opts.store ?? new MemoryStore();
  const rows = opts.rows ?? new SqliteRowStore(':memory:');
  const secrets = opts.secrets ?? new SqliteSecrets(openDatabase(':memory:'));
  const workflows =
    opts.workflows ??
    new Workflows({ deployments: new SqliteDeployments(openDatabase(':memory:')), store, rows, secrets, timeLimitMs: opts.timeLimitMs });
  const app = new Hono().basePath('/api');

  app.route('/projects', rowRoutes(rows));
  app.route('/projects', workflowRoutes(workflows));
  app.route('/projects', secretRoutes(secrets));
  app.route('/hooks', hookRoutes(workflows));

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
      return c.json(await runGraph(req, { store, rows, secrets, timeLimitMs: opts.timeLimitMs, replies: req.replies }));
    },
  );

  app.notFound((c) => c.json(problem('Not found.'), 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json(problem('Something went wrong on the server.'), 500);
  });
  return app;
}
