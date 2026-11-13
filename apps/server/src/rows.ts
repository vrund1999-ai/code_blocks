// Rows of the project's data tables, kept in SQLite (Node's built-in
// node:sqlite). The columns are designed in the editor and saved in the
// project, so the server doesn't know them: a row's values are kept by column
// id, which stays the same when a column is renamed. Each table numbers its
// rows 1, 2, 3…, and a deleted row's number is never used again.

import { DatabaseSync } from 'node:sqlite';
import type { CellValue } from '@code-blocks/engine/tables';

export type { CellValue };

export interface Row {
  id: number;
  /** Cell values by column id. */
  values: Record<string, CellValue>;
}

export interface RowPage {
  rows: Row[];
  /** How many rows the table has in all. */
  total: number;
}

export interface RowStore {
  list(projectId: string, tableId: string, opts?: { limit?: number; offset?: number }): RowPage;
  add(projectId: string, tableId: string, values: Record<string, CellValue>): Row;
  /** Changes the given cells; others keep their values. Null when there is no such row. */
  update(projectId: string, tableId: string, rowId: number, values: Record<string, CellValue>): Row | null;
  /** False when there was no such row. */
  remove(projectId: string, tableId: string, rowId: number): boolean;
}

export const DEFAULT_PAGE = 100;
export const MAX_PAGE = 500;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS table_rows (
    project_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    row_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, table_id, row_id)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS table_sequences (
    project_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    next_id INTEGER NOT NULL,
    PRIMARY KEY (project_id, table_id)
  ) STRICT;
`;

interface StoredRow {
  row_id: number;
  data: string;
}

const toRow = (r: StoredRow): Row => ({ id: r.row_id, values: JSON.parse(r.data) });

export class SqliteRowStore implements RowStore {
  private db: DatabaseSync;

  /** `file` is a path, or ':memory:' for a database that lasts as long as the server. */
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  list(projectId: string, tableId: string, opts: { limit?: number; offset?: number } = {}): RowPage {
    const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_PAGE), MAX_PAGE);
    const offset = Math.max(0, opts.offset ?? 0);
    const rows = this.db
      .prepare(
        'SELECT row_id, data FROM table_rows WHERE project_id = ? AND table_id = ? ORDER BY row_id LIMIT ? OFFSET ?',
      )
      .all(projectId, tableId, limit, offset) as unknown as StoredRow[];
    const { n } = this.db
      .prepare('SELECT COUNT(*) AS n FROM table_rows WHERE project_id = ? AND table_id = ?')
      .get(projectId, tableId) as { n: number };
    return { rows: rows.map(toRow), total: n };
  }

  add(projectId: string, tableId: string, values: Record<string, CellValue>): Row {
    return this.transaction(() => {
      const seq = this.db
        .prepare('SELECT next_id FROM table_sequences WHERE project_id = ? AND table_id = ?')
        .get(projectId, tableId) as { next_id: number } | undefined;
      const id = seq?.next_id ?? 1;
      this.db
        .prepare(
          `INSERT INTO table_sequences (project_id, table_id, next_id) VALUES (?, ?, ?)
           ON CONFLICT (project_id, table_id) DO UPDATE SET next_id = excluded.next_id`,
        )
        .run(projectId, tableId, id + 1);
      const now = new Date().toISOString();
      this.db
        .prepare('INSERT INTO table_rows (project_id, table_id, row_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(projectId, tableId, id, JSON.stringify(values), now, now);
      return { id, values: { ...values } };
    });
  }

  update(projectId: string, tableId: string, rowId: number, values: Record<string, CellValue>): Row | null {
    return this.transaction(() => {
      const found = this.db
        .prepare('SELECT row_id, data FROM table_rows WHERE project_id = ? AND table_id = ? AND row_id = ?')
        .get(projectId, tableId, rowId) as StoredRow | undefined;
      if (!found) return null;
      const row = toRow(found);
      row.values = { ...row.values, ...values };
      this.db
        .prepare('UPDATE table_rows SET data = ?, updated_at = ? WHERE project_id = ? AND table_id = ? AND row_id = ?')
        .run(JSON.stringify(row.values), new Date().toISOString(), projectId, tableId, rowId);
      return row;
    });
  }

  remove(projectId: string, tableId: string, rowId: number): boolean {
    const { changes } = this.db
      .prepare('DELETE FROM table_rows WHERE project_id = ? AND table_id = ? AND row_id = ?')
      .run(projectId, tableId, rowId);
    return Number(changes) > 0;
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
