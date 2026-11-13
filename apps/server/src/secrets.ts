// Secrets, such as API keys, kept per project on the server. The editor can
// add, replace and delete them, and list their names, but never read their
// values back. Server workflows read them with the *Secret* block, and runs
// hide their values (see redact) in everything they send back.

import type { DatabaseSync } from 'node:sqlite';

export interface SecretInfo {
  name: string;
  /** When the value was last set, as an ISO date. */
  updatedAt: string;
}

export interface SecretStore {
  /** The project's secrets, by name, without their values. */
  list(projectId: string): SecretInfo[];
  /** A secret's value, matching the name ignoring case. */
  get(projectId: string, name: string): string | undefined;
  set(projectId: string, name: string, value: string): SecretInfo;
  /** False when there was no such secret. */
  remove(projectId: string, name: string): boolean;
}

export class SqliteSecrets implements SecretStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        project_id TEXT NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, name)
      ) STRICT;
    `);
  }

  list(projectId: string): SecretInfo[] {
    const rows = this.db
      .prepare('SELECT name, updated_at FROM secrets WHERE project_id = ? ORDER BY name COLLATE NOCASE')
      .all(projectId) as { name: string; updated_at: string }[];
    return rows.map((r) => ({ name: r.name, updatedAt: r.updated_at }));
  }

  get(projectId: string, name: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM secrets WHERE project_id = ? AND name = ?').get(projectId, name) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  set(projectId: string, name: string, value: string): SecretInfo {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO secrets (project_id, name, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (project_id, name) DO UPDATE SET name = excluded.name, value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(projectId, name, value, updatedAt);
    return { name, updatedAt };
  }

  remove(projectId: string, name: string): boolean {
    return Number(this.db.prepare('DELETE FROM secrets WHERE project_id = ? AND name = ?').run(projectId, name).changes) > 0;
  }
}

/** What a hidden secret shows as. */
export const HIDDEN = '•••';

/**
 * Copies `value` with every secret in `secrets` replaced by •••, in text at
 * any depth of records and lists (and in record field names). This is a
 * safety net for what runs send back; a workflow that changes a secret
 * before showing it (say, splits it up) can still reveal it.
 */
export function redact<T>(value: T, secrets: ReadonlySet<string>): T {
  if (secrets.size === 0) return value;
  // Longest first, so a secret that contains another is hidden whole.
  const list = [...secrets].sort((a, b) => b.length - a.length);
  const text = (s: string) => list.reduce((out, secret) => out.split(secret).join(HIDDEN), s);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return text(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [text(k), walk(x)]));
    return v;
  };
  return walk(value) as T;
}
