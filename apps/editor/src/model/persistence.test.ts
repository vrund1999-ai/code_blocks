import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATES } from '../templates';
import { makeProject } from './factory';
import {
  appStoragePrefix,
  deleteProject,
  forgetLocalCopy,
  lastProjectId,
  listProjects,
  loadProject,
  localProject,
  parseImported,
  saveProject,
  setLastProject,
} from './persistence';

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

  it('lists saved projects, the latest first, each saved once', () => {
    vi.useFakeTimers();
    try {
      const a = makeProject('First');
      const b = makeProject('Second');
      vi.setSystemTime(1000);
      saveProject(a);
      vi.setSystemTime(2000);
      saveProject(b);
      expect(listProjects().map((m) => m.name)).toEqual(['Second', 'First']);

      // Saving again moves it to the top, under its new name.
      vi.setSystemTime(3000);
      saveProject({ ...a, name: 'First, renamed' });
      expect(listProjects()).toEqual([
        { id: a.id, name: 'First, renamed', updatedAt: 3000 },
        { id: b.id, name: 'Second', updatedAt: 2000 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('remembers which account version a local copy is based on', () => {
    const p = makeProject('Cloud');
    saveProject(p, 4);
    expect(localProject(p.id)?.accountVersion).toBe(4);
    saveProject(p);
    expect(localProject(p.id)).not.toHaveProperty('accountVersion');
    expect(localProject('missing')).toBeUndefined();
  });

  it('treats a damaged list of projects as empty', () => {
    store.set('cb.projects', 'not json');
    expect(listProjects()).toEqual([]);
    saveProject(makeProject('Fresh'));
    expect(listProjects().map((m) => m.name)).toEqual(['Fresh']);
  });

  it('remembers the project opened last', () => {
    expect(lastProjectId()).toBeNull();
    setLastProject('abc');
    expect(lastProjectId()).toBe('abc');
  });

  it('deleting a project also forgets what its app saved, but not other projects’ data', () => {
    const a = makeProject('A');
    const b = makeProject('B');
    saveProject(a);
    saveProject(b);
    store.set(`${appStoragePrefix(a.id)}scores`, '[1]');
    store.set(`${appStoragePrefix(a.id)}name`, '"Ada"');
    store.set(`${appStoragePrefix(b.id)}scores`, '[2]');
    deleteProject(a.id);
    expect(loadProject(a.id)).toBeNull();
    expect(listProjects().map((m) => m.id)).toEqual([b.id]);
    expect([...store.keys()].filter((k) => k.startsWith('cb.app.'))).toEqual([`${appStoragePrefix(b.id)}scores`]);
  });

  it('forgets only the copy of a project saved to an account, keeping what its app saved', () => {
    const p = makeProject('Moved');
    saveProject(p);
    store.set(`${appStoragePrefix(p.id)}scores`, '[1]');
    forgetLocalCopy(p.id);
    expect(loadProject(p.id)).toBeNull();
    expect(listProjects()).toEqual([]);
    expect(store.get(`${appStoragePrefix(p.id)}scores`)).toBe('[1]');

    // Nothing to forget: the list of projects isn't touched.
    store.set('cb.projects', 'kept as it is');
    forgetLocalCopy(p.id);
    expect(store.get('cb.projects')).toBe('kept as it is');
  });
});
