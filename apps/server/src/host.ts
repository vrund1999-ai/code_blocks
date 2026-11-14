// The engine's HostApi on the server. There is no screen here, so blocks that
// change or read the screen stop with a friendly message. Messages from
// *Show a message* are collected and returned with the run.

import { coerceTo } from '@code-blocks/engine/convert';
import type { DataTable, StoredRow } from '@code-blocks/engine/tables';
import { HostError, type HostApi } from '@code-blocks/engine/types';
import { RequestProblem, sendRequest } from './http';
import { MAX_PAGE, type RowStore } from './rows';
import type { SecretStore } from './secrets';
import type { KeyValueStore } from './store';

export interface ServerVariable {
  id: string;
  type: string;
  initial: unknown;
}

export interface ServerHostOptions {
  projectId: string;
  variables: ServerVariable[];
  store: KeyValueStore;
  /** The project's data tables (their columns) and where their rows are kept. */
  tables: DataTable[];
  rows: RowStore;
  /** The project's secrets, for *Secret* blocks. Without it, there are none. */
  secrets?: SecretStore;
  /** Aborted when the run has to stop. Every host call after that stops the run. */
  signal: AbortSignal;
  /** The message shown when `signal` stops the run. */
  stoppedMessage: string;
  /** Takes the answer of a *Reply* block. Left out for runs nothing waits on, such as schedules. */
  reply?(value: unknown, status: number): void;
}

export interface ServerHost {
  host: HostApi;
  vars: Record<string, unknown>;
  messages: string[];
  /** The values of the secrets the run read, to hide them in what it sends back. */
  secretsRead: Set<string>;
}

export const CHANGES_SCREEN = 'This block changes what’s on screen, so it only works in the app, not on the server.';
export const READS_SCREEN = 'This block reads what’s on screen, so it only works in the app, not on the server.';
export const NAVIGATES = 'Go to screen only works in the app, not on the server.';

export function createServerHost(opts: ServerHostOptions): ServerHost {
  const { projectId, store, rows, signal } = opts;
  const types = new Map(opts.variables.map((v) => [v.id, v.type]));
  const vars: Record<string, unknown> = {};
  for (const v of opts.variables) vars[v.id] = structuredClone(v.initial);
  const messages: string[] = [];
  const secretsRead = new Set<string>();

  const check = () => {
    if (signal.aborted) throw new HostError(opts.stoppedMessage);
  };

  const host: HostApi = {
    getVar: (id) => {
      check();
      return vars[id];
    },
    setVar: (id, value) => {
      check();
      vars[id] = coerceTo(types.get(id), value);
    },
    getElementValue: () => {
      throw new HostError(READS_SCREEN);
    },
    setElementProp: () => {
      throw new HostError(CHANGES_SCREEN);
    },
    toast: (message) => {
      check();
      messages.push(message);
    },
    navigate: () => {
      throw new HostError(NAVIGATES);
    },
    storageGet: (key) => {
      check();
      return store.get(projectId, key);
    },
    storageSet: (key, value) => {
      check();
      store.set(projectId, key, value);
    },
    sleep: (ms) =>
      new Promise<void>((resolve, reject) => {
        check();
        const stop = () => {
          clearTimeout(timer);
          reject(new HostError(opts.stoppedMessage));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', stop);
          resolve();
        }, ms);
        signal.addEventListener('abort', stop, { once: true });
      }),
    secret: (name) => {
      check();
      const value = opts.secrets?.get(projectId, name);
      if (value !== undefined) secretsRead.add(value);
      return value;
    },
    // "Send from" doesn't matter here: the run is already on the server.
    httpRequest: async ({ method, url, headers, body }) => {
      check();
      try {
        return await sendRequest({ method, url, headers, body }, signal);
      } catch (err) {
        check();
        if (err instanceof RequestProblem) throw new HostError(err.message);
        throw err;
      }
    },
    tables: {
      table: (id) => opts.tables.find((t) => t.id === id),
      rows: async (tableId) => {
        check();
        const all: StoredRow[] = [];
        for (;;) {
          const page = rows.list(projectId, tableId, { limit: MAX_PAGE, offset: all.length });
          all.push(...page.rows);
          if (page.rows.length === 0 || all.length >= page.total) return all;
        }
      },
      add: async (tableId, values) => {
        check();
        return rows.add(projectId, tableId, values);
      },
      update: async (tableId, rowId, values) => {
        check();
        return rows.update(projectId, tableId, rowId, values);
      },
      remove: async (tableId, rowId) => {
        check();
        return rows.remove(projectId, tableId, rowId);
      },
    },
  };
  if (opts.reply) {
    const reply = opts.reply;
    host.reply = (value, status) => {
      check();
      reply(value, status);
    };
  }
  return { host, vars, messages, secretsRead };
}
