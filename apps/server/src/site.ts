// Serves the editor's built files (apps/editor/dist) next to the API, so one
// server is all a host needs:
//   /api/*      the API (app.ts)
//   /assets/*   the built scripts and styles, cached for a year (their names change with their contents)
//   /, /app/*   index.html, which opens the editor or a published app

import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import type { createApp } from './app';

/** Where `npm run build` puts the editor, from apps/server. */
export const EDITOR_DIST = '../editor/dist';

export function createSite(api: ReturnType<typeof createApp>, dir: string) {
  const root = resolve(dir);
  const indexFile = join(root, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(`There’s no built editor in ${root}. Run “npm run build” first.`);
  }
  const index = readFileSync(indexFile, 'utf8');
  const site = new Hono();

  site.route('/', api);
  // The API answers its own addresses, including the ones it doesn't know.
  site.all('/api/*', (c) => c.json({ error: { message: 'Not found.' } }, 404));

  site.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  // The editor's own pages: the editor at /, and published apps at /app/:slug.
  // index.html isn't cached, so a new build reaches people on their next visit.
  const page = () =>
    new Response(index, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
  site.get('/', page);
  site.get('/index.html', page);
  site.get('/app/*', page);
  site.use('*', serveStatic({ root }));

  site.notFound((c) => c.text('Not found.', 404));
  return site;
}
