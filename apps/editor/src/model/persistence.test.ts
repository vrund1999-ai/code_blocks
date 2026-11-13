import { describe, expect, it } from 'vitest';
import { makeProject } from './factory';
import { migrate, parseImported } from './persistence';

describe('project files', () => {
  it('gives projects saved before data tables an empty table list', () => {
    const { tables: _, ...old } = makeProject('Old');
    expect(migrate(old as never).tables).toEqual([]);
    expect(parseImported(JSON.stringify(old)).tables).toEqual([]);
  });

  it('keeps tables, and refuses a file whose tables are not a list', () => {
    const p = makeProject('New');
    p.tables = [{ id: 't', name: 'Contacts', columns: [{ id: 'c', name: 'Name', type: 'text' }] }];
    expect(parseImported(JSON.stringify(p)).tables).toEqual(p.tables);
    expect(() => parseImported(JSON.stringify({ ...p, tables: 'nope' }))).toThrow(/does not look like a Code Blocks project/);
  });
});
