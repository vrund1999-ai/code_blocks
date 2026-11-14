// Starts the server. PORT and HOST can be set in the environment.
// It listens on this computer only (127.0.0.1) unless HOST says otherwise,
// because runs can make web requests from wherever the server is.

// Accounts, table rows, deployed projects, saved values and secrets are kept in DB_FILE
// (data/code-blocks.db by default, inside apps/server); DB_FILE=:memory:
// keeps them only while the server runs.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { openDatabase } from './db';
import { SqliteDeployments } from './deployments';
import { SqliteRowStore } from './rows';
import { SqliteSecrets } from './secrets';
import { SqliteStore } from './store';
import { SqliteUsers } from './users';
import { Workflows } from './workflows';

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.HOST ?? '127.0.0.1';
const dbFile = process.env.DB_FILE ?? 'data/code-blocks.db';

if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });
const db = openDatabase(dbFile);
const rows = new SqliteRowStore(db);
const store = new SqliteStore(db);
const secrets = new SqliteSecrets(db);
const deployments = new SqliteDeployments(db);
const users = new SqliteUsers(db);
const workflows = new Workflows({ deployments, store, rows, secrets });
workflows.start();

serve({ fetch: createApp({ rows, store, secrets, workflows, users }).fetch, port, hostname }, (info) => {
  console.log(`Code Blocks server running at http://${info.address}:${info.port}/api`);
  console.log(`Data: ${dbFile === ':memory:' ? 'in memory' : dbFile}`);
  console.log(`Deployed projects: ${deployments.all().length}`);
});
