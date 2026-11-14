import { beforeEach, describe, expect, it } from 'vitest';
import { TEMPLATES } from '../templates';
import { makeProject } from './factory';
import { loadProject, parseImported, saveProject } from './persistence';

describe('project files', () => {
  it('opens files saved before data tables, and keeps tables in newer ones', () => {
    const { tables: _, ...old } = makeProject('Old');
    expect(parseImported(JSON.stringify({ ...old, version: 1 })).tables).toEqual([]);

    const p = makeProject('New');
    p.tables = [{ id: 't', name: 'Contacts', columns: [{ id: 'c', name: 'Name', type: 'text' }] }];
    expect(parseImported(JSON.stringify(p))).toEqual(p);
  });

  it.each(TEMPLATES.map((t) => [t.name, t] as const))('the %s template passes the check unchanged', (_, t) => {
    const p = t.create();
    expect(parseImported(JSON.stringify(p))).toEqual(JSON.parse(JSON.stringify(p)));
  });

  it('says why a file can’t be opened', () => {
    const p = makeProject('Broken');
    expect(() => parseImported('not json')).toThrow('This project file can’t be opened. It doesn’t look like a Code Blocks project.');
    expect(() => parseImported(JSON.stringify({ ...p, tables: 'nope' }))).toThrow(
      'This project file can’t be opened. “tables” should be a list.',
    );
  });
});

describe('saved projects', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
    } as Storage;
  });

  it('load checked, and say when the saved copy is damaged', () => {
    const p = makeProject('Saved');
    saveProject(p);
    expect(loadProject(p.id)).toEqual(p);
    expect(loadProject('missing')).toBeNull();

    store.set(`cb.project.${p.id}`, '{"oops');
    expect(() => loadProject(p.id)).toThrow('Its saved copy is damaged.');
    store.set(`cb.project.${p.id}`, JSON.stringify({ ...p, screens: [] }));
    expect(() => loadProject(p.id)).toThrow('A project needs at least one screen.');
  });
});
