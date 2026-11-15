// Secrets, such as API keys, kept per project on the server. The editor can
// add, replace and delete them, and list their names, but never read their
// values back. Server workflows read them with the *Secret* block, and runs
// hide their values (see redact) in everything they send back.
//
// Values are encrypted in the database (AES-256-GCM), so a copy of the
// database file alone doesn't give them away. The key comes from SECRETS_KEY,
// or from a file next to the database (see loadSecretsKey).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  /** Deletes all of the project's secrets. */
  removeProject(projectId: string): void;
}

/** Marks an encrypted value. Values saved before encryption have no mark. */
const SEALED = 'enc1:';
const KEY_BYTES = 32;

export const WRONG_KEY =
  'The secrets in the database were saved with a different key. Set SECRETS_KEY (or the key file) back to the one used before.';

/** Encrypts `value`, tied to its project so it can't be moved to another one. */
function seal(key: Buffer, projectId: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(projectId));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return SEALED + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

function open(key: Buffer, projectId: string, stored: string): string {
  if (!stored.startsWith(SEALED)) return stored;
  const raw = Buffer.from(stored.slice(SEALED.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(projectId));
  decipher.setAuthTag(raw.subarray(12, 28));
  try {
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    throw new Error(WRONG_KEY);
  }
}

/** Reads a key written as base64, which has to be 32 bytes. */
export function parseSecretsKey(text: string): Buffer {
  const key = Buffer.from(text.trim(), 'base64');
  if (key.length !== KEY_BYTES) throw new Error(`The secrets key must be ${KEY_BYTES} bytes, written as base64.`);
  return key;
}

/**
 * The key for secrets: SECRETS_KEY when it's set, or else the key in
 * `keyFile`, made the first time. Keep the file out of database backups.
 */
export function loadSecretsKey(env: string | undefined, keyFile: string | null): Buffer {
  if (env) return parseSecretsKey(env);
  if (!keyFile) return randomBytes(KEY_BYTES);
  if (existsSync(keyFile)) return parseSecretsKey(readFileSync(keyFile, 'utf8'));
  const key = randomBytes(KEY_BYTES);
  writeFileSync(keyFile, `${key.toString('base64')}\n`, { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  return key;
}

export class SqliteSecrets implements SecretStore {
  /** `key` encrypts the values; without one, a new key is made (fine for a database in memory). */
  constructor(
    private db: DatabaseSync,
    private key: Buffer = randomBytes(KEY_BYTES),
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        project_id TEXT NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, name)
      ) STRICT;
    `);
    const rows = db.prepare('SELECT project_id, name, value FROM secrets').all() as { project_id: string; name: string; value: string }[];
    // Fails early, with WRONG_KEY, when the key isn't the one they were saved with.
    const sealed = rows.find((r) => r.value.startsWith(SEALED));
    if (sealed) open(key, sealed.project_id, sealed.value);
    // Encrypts values saved before secrets were encrypted.
    const update = db.prepare('UPDATE secrets SET value = ? WHERE project_id = ? AND name = ?');
    for (const r of rows) if (!r.value.startsWith(SEALED)) update.run(seal(key, r.project_id, r.value), r.project_id, r.name);
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
    return row && open(this.key, projectId, row.value);
  }

  set(projectId: string, name: string, value: string): SecretInfo {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO secrets (project_id, name, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (project_id, name) DO UPDATE SET name = excluded.name, value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(projectId, name, seal(this.key, projectId, value), updatedAt);
    return { name, updatedAt };
  }

  remove(projectId: string, name: string): boolean {
    return Number(this.db.prepare('DELETE FROM secrets WHERE project_id = ? AND name = ?').run(projectId, name).changes) > 0;
  }

  removeProject(projectId: string): void {
    this.db.prepare('DELETE FROM secrets WHERE project_id = ?').run(projectId);
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
