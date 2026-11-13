// Trying a server workflow before deploying it: runs one server event block
// of the editor's current copy once, on the server, with sample data
// (apps/server/src/app.ts, POST /api/run).

import { parseBody } from '@code-blocks/engine/nodes/web';
import { hookMethod } from '@code-blocks/engine/nodes/server';
import type { Project } from '../model/types';
import { call } from './api';
import { SERVER_OFFLINE } from './serverApi';

/** The server event blocks that can be tried. */
export const TRYABLE = ['server.http', 'server.form', 'server.schedule'];

/** Sample data typed into the Try it section. */
export interface TrySample {
  /** For web addresses: address values, one `name: value` per line. */
  query: string;
  /** For web addresses: the data sent, as text or JSON. */
  body: string;
  /** For forms: the values sent, one `name: value` per line. */
  values: string;
}

export const EMPTY_SAMPLE: TrySample = { query: '', body: '', values: '' };

export interface TryResult {
  ok: boolean;
  error?: { nodeId: string; message: string };
  messages: string[];
  reply?: { value: unknown; status: number };
  /** The blocks that ran, in order, with the inputs they read. */
  steps: { nodeId: string; payload?: Record<string, unknown>; inputs: Record<string, unknown> }[];
  dropped: number;
}

/**
 * Reads `name: value` lines (or `name = value`) into a record. Blank lines
 * are skipped. Gives a message instead when a line has no name.
 */
export function parseFields(text: string): Record<string, string> | string {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const at = line.search(/[:=]/);
    const name = at > 0 ? line.slice(0, at).trim() : '';
    if (!name) return `Write each value on its own line, as a name and a value, like “name: Ada”. This line has no name: “${line.trim()}”.`;
    values[name] = line.slice(at + 1).trim();
  }
  return values;
}

/**
 * What the event block carries for this sample, like the server sends it
 * when the real trigger happens. Gives a message when the sample can't be read.
 */
export function samplePayload(
  type: string,
  config: Record<string, unknown>,
  sample: TrySample,
  now = new Date(),
): Record<string, unknown> | string {
  if (type === 'server.http') {
    const query = parseFields(sample.query);
    if (typeof query === 'string') return query;
    const body = parseBody(sample.body);
    const set = hookMethod(config);
    // “Any” answers every method; try it as a GET, or a POST when data is sent.
    const method = set === 'ANY' ? (sample.body.trim() ? 'POST' : 'GET') : set;
    return { body: method === 'GET' ? '' : body, query, method };
  }
  if (type === 'server.form') {
    const values = parseFields(sample.values);
    return typeof values === 'string' ? values : { values };
  }
  return { time: now.toISOString() };
}

/** Runs the event block `nodeId` of the project as it is now, once, on the server. */
export const tryWorkflow = (p: Project, nodeId: string, payload: Record<string, unknown>) =>
  call<TryResult>(
    '/api/run',
    {
      method: 'POST',
      body: JSON.stringify({
        graph: p.graph,
        variables: p.variables,
        tables: p.tables,
        projectId: p.id,
        nodeId,
        payload,
        replies: true,
      }),
    },
    SERVER_OFFLINE,
  );
