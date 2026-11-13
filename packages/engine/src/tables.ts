// Data tables: lists of rows with the same named columns, like a simple
// spreadsheet. The columns (the schema) are part of the project; the rows
// live on the server. Shared by the editor and the server.

import { findField, toBool, toNumber, toRecord, toText, type Rec } from './convert';

/** What a column holds. Every row also gets an automatic `id` number. */
export type ColumnType = 'text' | 'number' | 'boolean';

export interface TableColumn {
  id: string;
  name: string;
  type: ColumnType;
}

export interface DataTable {
  id: string;
  name: string;
  columns: TableColumn[];
}

/** The automatic row number every table has. Columns can't use this name. */
export const ROW_ID = 'id';

export const COLUMN_TYPES: ColumnType[] = ['text', 'number', 'boolean'];

const norm = (s: string) => s.trim().toLowerCase();

/**
 * A friendly message if a column's name can't be used, or null. Names are
 * compared ignoring case and surrounding spaces, as blocks look fields up
 * that way.
 */
export function columnProblem(table: DataTable, column: TableColumn): string | null {
  const name = norm(column.name);
  if (name === '') return 'Give this column a name.';
  if (name === ROW_ID) return '“id” is the row number every row gets. Pick another name.';
  if (table.columns.some((c) => c.id !== column.id && norm(c.name) === name)) {
    return `Another column is already called “${column.name.trim()}”.`;
  }
  return null;
}

/** A friendly message if a table's name can't be used, or null. */
export function tableProblem(tables: DataTable[], table: DataTable): string | null {
  const name = norm(table.name);
  if (name === '') return 'Give this table a name.';
  if (tables.some((t) => t.id !== table.id && norm(t.name) === name)) {
    return `Another table is already called “${table.name.trim()}”.`;
  }
  return null;
}

/** A cell: text, a number, yes/no, or empty. */
export type CellValue = string | number | boolean | null;

/**
 * A stored cell as its column's kind. Rows keep the value they were saved
 * with, so after a column changes kind its old values are converted here.
 * Empty text and numbers stay empty (null); an empty yes/no is "no".
 */
export function cellValue(type: ColumnType, v: unknown): CellValue {
  switch (type) {
    case 'boolean':
      return toBool(v ?? false);
    case 'number':
      return v === null || v === undefined || v === '' ? null : toNumber(v);
    default:
      return v === null || v === undefined ? '' : toText(v);
  }
}

/** A row as the server keeps it: values by column id. */
export interface StoredRow {
  id: number;
  values: Record<string, CellValue>;
}

/** A row as blocks see it: a record keyed by column name, plus its `id`. */
export function rowToRecord(table: DataTable, row: StoredRow): Rec {
  const rec: Rec = { [ROW_ID]: row.id };
  for (const col of table.columns) {
    const name = col.name.trim();
    if (name && !(name in rec)) rec[name] = cellValue(col.type, row.values[col.id]);
  }
  return rec;
}

/**
 * The cells a record sets, by column id, converted to each column's kind.
 * Fields are matched to columns by name, ignoring case and spaces; fields with
 * no column (and `id`) are left out.
 */
export function recordToValues(table: DataTable, value: unknown): Record<string, CellValue> {
  const rec = toRecord(value);
  const out: Record<string, CellValue> = {};
  for (const col of table.columns) {
    const name = col.name.trim();
    if (!name || name.toLowerCase() === ROW_ID) continue;
    const field = findField(rec, name);
    if (field !== undefined) out[col.id] = cellValue(col.type, rec[field]);
  }
  return out;
}
