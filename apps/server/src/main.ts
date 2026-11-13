// Starts the server. PORT and HOST can be set in the environment.
// It listens on this computer only (127.0.0.1) unless HOST says otherwise,
// because runs can make web requests from wherever the server is.

// Table rows are kept in DB_FILE (data/code-blocks.db by default, inside
// apps/server); DB_FILE=:memory: keeps them only while the server runs.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { SqliteRowStore } from './rows';

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.HOST ?? '127.0.0.1';
const dbFile = process.env.DB_FILE ?? 'data/code-blocks.db';

if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });
const rows = new SqliteRowStore(dbFile);

serve({ fetch: createApp({ rows }).fetch, port, hostname }, (info) => {
  console.log(`Code Blocks server running at http://${info.address}:${info.port}/api`);
  console.log(`Table rows: ${dbFile === ':memory:' ? 'in memory' : dbFile}`);
});
