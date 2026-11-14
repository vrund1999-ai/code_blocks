// Sends the app's *Fetch from API* requests whose "Send from" is "The server",
// for APIs that don't let apps in a browser read their answers (CORS):
//   POST /api/fetch  { method, url, headers?, body? }  →  { status, statusText, text }
// It never fills in secrets: anyone using the app could send them anywhere.
// Server workflows are the place to use them.

import { HTTP_METHODS } from '@code-blocks/engine/nodes/web';
import type { HttpRequest } from '@code-blocks/engine/types';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { RequestProblem, sendRequest } from './http';

/** The biggest request accepted, with its headers and data. */
export const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_HEADERS = 50;

const problem = (message: string) => ({ error: { message } });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The request to send, or what's wrong with it. */
export function parseFetchRequest(v: unknown): HttpRequest | string {
  if (!isObject(v)) return 'Send the request as JSON: { "method", "url", "headers", "body" }.';
  const method = typeof v.method === 'string' ? v.method.toUpperCase() : '';
  if (!(HTTP_METHODS as readonly string[]).includes(method)) return `"method" must be one of ${HTTP_METHODS.join(', ')}.`;
  if (typeof v.url !== 'string') return '"url" must be a web address.';
  let url: URL;
  try {
    url = new URL(v.url);
  } catch {
    return `“${v.url}” isn’t a web address.`;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only http:// and https:// web addresses can be fetched.';
  const headers: Record<string, string> = {};
  if (v.headers !== undefined) {
    if (!isObject(v.headers) || Object.values(v.headers).some((h) => typeof h !== 'string')) {
      return '"headers" must be a record of text values.';
    }
    if (Object.keys(v.headers).length > MAX_HEADERS) return `A request can have at most ${MAX_HEADERS} headers.`;
    Object.assign(headers, v.headers);
  }
  if (v.body !== undefined && typeof v.body !== 'string') return '"body" must be text.';
  if (method === 'GET' && v.body !== undefined) return 'A Get request can’t send data.';
  return { method, url: url.href, headers, body: v.body as string | undefined };
}

export function fetchRoutes() {
  const app = new Hono();
  app.post(
    '/',
    bodyLimit({ maxSize: MAX_REQUEST_BYTES, onError: (c) => c.json(problem('The request is too big (over 1 MB).'), 413) }),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(problem('The request body must be JSON.'), 400);
      }
      const req = parseFetchRequest(body);
      if (typeof req === 'string') return c.json(problem(req), 400);
      try {
        return c.json(await sendRequest(req));
      } catch (err) {
        const where = new URL(req.url).host;
        const message =
          err instanceof RequestProblem
            ? err.message
            : `The server couldn’t reach ${where}. Check the web address and your internet connection.`;
        return c.json(problem(message), 502);
      }
    },
  );
  return app;
}
