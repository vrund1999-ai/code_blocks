// Starts the server. PORT and HOST can be set in the environment.
// It listens on this computer only (127.0.0.1) unless HOST says otherwise,
// because runs can make web requests from wherever the server is.

import { serve } from '@hono/node-server';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.HOST ?? '127.0.0.1';

serve({ fetch: createApp().fetch, port, hostname }, (info) => {
  console.log(`Code Blocks server running at http://${info.address}:${info.port}/api`);
});
