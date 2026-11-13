// Where *Save to device* and *Load from device* blocks keep their values on the server.
// Values are kept per project, as JSON, like the browser's local storage.
// The server keeps them in its SQLite database, so scheduled workflows can
// remember things from one run to the next.

import type { DatabaseSync } from 'node:sqlite';

export interface KeyValueStore {
  get(projectId: string, key: string): unknown;
  set(projectId: string, key: string, value: unknown): void;
}

/** Keeps values only while the server runs. Used by tests. */
export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();

  get(projectId: string, key: string): unknown {
    const raw = this.data.get(`${projectId}\u0000${key}`);
    return raw === undefined ? undefined : JSON.parse(raw);
  }

  set(projectId: string, key: string, value: unknown): void {
    this.data.set(`${projectId}\u0000${key}`, JSON.stringify(value ?? null));
  }
}

export class SqliteStore implements KeyValueStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_values (
        project_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (project_id, key)
      ) STRICT;
    `);
  }

  get(projectId: string, key: string): unknown {
    const row = this.db.prepare('SELECT value FROM saved_values WHERE project_id = ? AND key = ?').get(projectId, key) as
      | { value: string }
      | undefined;
    return row === undefined ? undefined : JSON.parse(row.value);
  }

  set(projectId: string, key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO saved_values (project_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT (project_id, key) DO UPDATE SET value = excluded.value`,
      )
      .run(projectId, key, JSON.stringify(value ?? null));
  }
}
