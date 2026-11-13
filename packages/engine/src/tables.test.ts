import { describe, expect, it } from 'vitest';
import { cellValue, columnProblem, tableProblem, type DataTable } from './tables';

const table: DataTable = {
  id: 't',
  name: 'Contacts',
  columns: [
    { id: 'a', name: 'Name', type: 'text' },
    { id: 'b', name: ' name ', type: 'text' },
    { id: 'c', name: '', type: 'number' },
    { id: 'd', name: 'ID', type: 'number' },
    { id: 'e', name: 'Age', type: 'number' },
  ],
};

describe('columnProblem', () => {
  it('needs a name that is not taken, ignoring case and spaces', () => {
    const [name, dupe, empty, id, age] = table.columns;
    expect(columnProblem(table, name)).toBe('Another column is already called “Name”.');
    expect(columnProblem(table, dupe)).toBe('Another column is already called “name”.');
    expect(columnProblem(table, empty)).toBe('Give this column a name.');
    expect(columnProblem(table, id)).toMatch(/row number every row gets/);
    expect(columnProblem(table, age)).toBeNull();
  });
});

describe('tableProblem', () => {
  it('needs a name that no other table has', () => {
    const other: DataTable = { id: 'o', name: 'contacts ', columns: [] };
    expect(tableProblem([table, other], other)).toBe('Another table is already called “contacts”.');
    expect(tableProblem([table, { ...other, name: ' ' }], { ...other, name: ' ' })).toBe('Give this table a name.');
    expect(tableProblem([table, { ...other, name: 'Orders' }], { ...other, name: 'Orders' })).toBeNull();
  });
});

describe('cellValue', () => {
  it('shows stored values as the column’s kind', () => {
    expect(cellValue('text', 36)).toBe('36');
    expect(cellValue('text', null)).toBe('');
    expect(cellValue('number', '36')).toBe(36);
    expect(cellValue('number', 'abc')).toBe(0);
    expect(cellValue('number', '')).toBeNull();
    expect(cellValue('number', undefined)).toBeNull();
    expect(cellValue('boolean', 'no')).toBe(false);
    expect(cellValue('boolean', 'yes')).toBe(true);
    expect(cellValue('boolean', null)).toBe(false);
  });
});
