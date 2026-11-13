// Data tables: lists of rows with the same named columns, like a simple
// spreadsheet. The columns (the schema) are part of the project; the rows
// live on the server. Shared by the editor and the server.

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
