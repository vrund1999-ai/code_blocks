// The server's SQLite database (Node's built-in node:sqlite). Table rows,
// deployed projects and saved values share one file.

import { DatabaseSync } from 'node:sqlite';

/** `file` is a path, or ':memory:' for a database that lasts as long as the server. */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}
