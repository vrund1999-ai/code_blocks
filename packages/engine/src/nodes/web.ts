// Talking to web APIs. The host does the actual request (the browser's
// fetch today, Node's later), so this file stays free of DOM code.

import { findField, isRecord, toNumber, toRecord, toText } from '../convert';
import { execIn, GraphError, HostError, type NodeDef, type Pin } from '../types';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Whether the block sends its request from the server (see HttpRequest.viaServer). */
export const viaServer = (config: Record<string, unknown>) => config.via === 'server';

export function methodOf(config: Record<string, unknown>): HttpMethod {
  const m = String(config.method ?? 'GET').toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(m) ? (m as HttpMethod) : 'GET';
}

/** Adds `https://` when the address has no scheme, so "api.example.com/x" works. */
export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (url === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, '')}`;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(normalizeUrl(url)).host || undefined;
  } catch {
    return undefined;
  }
}

/** JSON answers become records, lists, numbers…; anything else stays text. */
export function parseBody(text: string): unknown {
  const t = text.trim();
  if (t === '') return '';
  try {
    return JSON.parse(t) ?? '';
  } catch {
    return text;
  }
}

/**
 * Picks a value out of an answer by a dotted path, such as `main.temp` or
 * `results.1.name`. Numbers pick list items, counting from 1 like the list
 * blocks do. Field names ignore case. A path that leads nowhere gives ''.
 */
export function pickPath(value: unknown, path: string): unknown {
  const parts = path
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean);
  let cur = value;
  for (const part of parts) {
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      cur = cur[Number(part) - 1];
    } else if (isRecord(cur)) {
      const key = findField(cur, part);
      cur = key === undefined ? undefined : cur[key];
    } else {
      cur = undefined;
    }
    if (cur === undefined) return '';
  }
  return cur ?? '';
}

const VERBS: Record<HttpMethod, string> = {
  GET: 'Load data from',
  POST: 'Send data to',
  PUT: 'Replace data at',
  PATCH: 'Update data at',
  DELETE: 'Delete data at',
};

const bodyPin: Pin = {
  id: 'body',
  label: 'Send',
  kind: 'data',
  valueType: 'any',
  inline: { type: 'text', default: '' },
};

export const webNodes: NodeDef[] = [
  {
    type: 'action.fetch',
    category: 'actions',
    label: 'Fetch from API',
    description:
      'Loads data from a web address (an API). JSON answers become records and lists you can use in other blocks.',
    inputs: [
      execIn,
      { id: 'url', label: 'Web address', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
      { id: 'field', label: 'Pick field', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
      { id: 'headers', label: 'Headers', kind: 'data', valueType: 'record' },
    ],
    // Only requests that send something get a "Send" input.
    dynamicInputs: (config) => (methodOf(config) === 'GET' ? [] : [bodyPin]),
    outputs: [
      { id: 'next', label: 'When loaded', kind: 'exec' },
      { id: 'failed', label: 'If it fails', kind: 'exec' },
      { id: 'result', label: 'Result', kind: 'data', valueType: 'any' },
      { id: 'status', label: 'Status code', kind: 'data', valueType: 'number' },
      { id: 'error', label: 'Problem', kind: 'data', valueType: 'text' },
    ],
    configFields: [
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        default: 'GET',
        options: [
          { value: 'GET', label: 'Get (load data)' },
          { value: 'POST', label: 'Post (send new data)' },
          { value: 'PUT', label: 'Put (replace data)' },
          { value: 'PATCH', label: 'Patch (change some data)' },
          { value: 'DELETE', label: 'Delete' },
        ],
      },
      {
        key: 'via',
        label: 'Send from',
        type: 'select',
        default: 'app',
        options: [
          { value: 'app', label: 'The app' },
          { value: 'server', label: 'The server (for APIs that block apps)' },
        ],
      },
    ],
    sentence: (c) =>
      `${VERBS[methodOf(c)]} ${hostOf(toText(c.url)) ?? 'a web address'}${viaServer(c) ? ' through the server' : ''}`,
    async execute(ctx) {
      const method = methodOf(ctx.config);
      const url = normalizeUrl(toText(await ctx.input('url')));
      if (url === '') throw new GraphError(ctx.node.id, 'Type the web address to fetch from.');
      const where = hostOf(url) ?? url;

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(toRecord(await ctx.input('headers')))) {
        if (k.trim()) headers[k.trim()] = toText(v);
      }
      const hasHeader = (name: string) => Object.keys(headers).some((k) => k.toLowerCase() === name);

      let body: string | undefined;
      if (method !== 'GET') {
        const raw = await ctx.input('body');
        if (isRecord(raw) || Array.isArray(raw)) {
          body = JSON.stringify(raw);
          if (!hasHeader('content-type')) headers['Content-Type'] = 'application/json';
        } else if (raw !== undefined && raw !== null && toText(raw) !== '') {
          body = toText(raw);
        }
      }
      const path = toText(await ctx.input('field'));

      // Without an "If it fails" branch, a failure is shown like any other block error.
      const fail = (message: string, result: unknown, status: number) => {
        ctx.setOutputs({ result, status, error: message });
        if (!ctx.hasBranch('failed')) throw new GraphError(ctx.node.id, message);
        return 'failed';
      };

      const fromServer = viaServer(ctx.config);
      let res;
      try {
        res = await ctx.host.httpRequest({ method, url, headers, body, ...(fromServer ? { viaServer: true } : {}) });
      } catch (err) {
        if (err instanceof HostError) return fail(err.message, '', 0);
        const hint = fromServer
          ? ''
          : ' Some sites also don’t let apps in a browser read their data; for those, set “Send from” to “The server”.';
        return fail(`Couldn’t reach ${where}. Check the web address and your internet connection.${hint}`, '', 0);
      }
      const data = parseBody(res.text);
      const status = toNumber(res.status);
      if (status < 200 || status >= 300) {
        const reason = res.statusText ? ` (${res.statusText})` : '';
        return fail(`${where} answered with error ${status}${reason}.`, data, status);
      }
      ctx.setOutputs({ result: pickPath(data, path), status, error: '' });
      return 'next';
    },
  },
];
