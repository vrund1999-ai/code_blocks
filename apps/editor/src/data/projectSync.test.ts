import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProject } from '../model/factory';
import { listProjects, loadProject } from '../model/persistence';
import { useProjectStore } from '../model/projectStore';
import { useAuthStore } from './authStore';
import { keepThisCopy, saveCurrent, useSaveStore } from './projectSync';

const store = new Map<string, string>();
/** The bodies of the saves sent to the server. */
let sent: { project: { name: string }; baseVersion: unknown }[] = [];
/** How the fake server answers the next save. */
let answer: () => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  store.clear();
  sent = [];
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
  let version = 0;
  answer = () => json({ version: ++version, updatedAt: 1 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit = {}) => {
      if (init.method === 'PUT') sent.push(JSON.parse(String(init.body)));
      return answer();
    }),
  );
  useAuthStore.setState({ status: 'guest', user: null });
});

afterEach(() => vi.unstubAllGlobals());

/** Opens a new project in the editor and returns a function that renames it. */
function openNew(name: string) {
  const p = makeProject(name);
  useProjectStore.getState().loadProject(p);
  useSaveStore.setState({ status: 'idle', problem: '' });
  return { id: p.id, rename: (to: string) => useProjectStore.getState().renameProject(to) };
}

const status = () => useSaveStore.getState().status;
const signIn = () => useAuthStore.setState({ status: 'signed-in', user: { id: 'u1', email: 'ada@example.com' } });

describe('saving the open project', () => {
  it('saves in this browser for guests', () => {
    const p = openNew('Guest app');
    p.rename('Guest app 2');
    saveCurrent();
    expect(status()).toBe('browser');
    expect(loadProject(p.id)?.name).toBe('Guest app 2');
    expect(sent).toEqual([]);
  });

  it('saves to the account when signed in, based on the version saved last', async () => {
    signIn();
    const p = openNew('Shop');
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('saved'));
    p.rename('Shop 2');
    saveCurrent();
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    await vi.waitFor(() => expect(status()).toBe('saved'));
    expect(sent.map((s) => [s.project.name, s.baseVersion])).toEqual([
      ['Shop', null],
      ['Shop 2', 1],
    ]);
    // Nothing is left in this browser.
    expect(loadProject(p.id)).toBeNull();
  });

  it('keeps the work here and asks first when it was changed elsewhere', async () => {
    signIn();
    const p = openNew('Quiz');
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('saved'));

    answer = () =>
      sent.length === 2
        ? json({ error: { message: 'Changed in another tab.' }, current: { version: 2 } }, 409)
        : json({ project: makeProject('Other copy'), version: 2, updatedAt: 1 });
    p.rename('Quiz, changed here');
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('conflict'));
    expect(useSaveStore.getState().problem).toBe('Changed in another tab.');
    expect(loadProject(p.id)?.name).toBe('Quiz, changed here');
    expect(listProjects().find((m) => m.id === p.id)?.accountVersion).toBe(1);

    // More changes stay here until the person chooses.
    p.rename('Quiz, changed again');
    saveCurrent();
    expect(sent).toHaveLength(2);
    expect(loadProject(p.id)?.name).toBe('Quiz, changed again');

    answer = () => json({ version: 3, updatedAt: 1 });
    keepThisCopy();
    await vi.waitFor(() => expect(status()).toBe('saved'));
    expect(sent[2]).toMatchObject({ project: { name: 'Quiz, changed again' }, baseVersion: 'any' });
    expect(loadProject(p.id)).toBeNull();
  });

  it('keeps the work here while the server can’t be reached', async () => {
    signIn();
    const p = openNew('Notes');
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('saved'));

    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    p.rename('Notes, offline');
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('offline'));
    expect(loadProject(p.id)?.name).toBe('Notes, offline');
    expect(listProjects().find((m) => m.id === p.id)?.accountVersion).toBe(1);

    // The next save is based on the account's version, and clears the copy here.
    answer = () => json({ version: 2, updatedAt: 1 });
    p.rename('Notes, back online');
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('saved'));
    expect(sent.at(-1)).toMatchObject({ project: { name: 'Notes, back online' }, baseVersion: 1 });
    expect(loadProject(p.id)).toBeNull();
  });

  it('keeps another account’s project in this browser, without asking again', async () => {
    signIn();
    const p = openNew('Theirs');
    answer = () => json({ error: { message: 'This project belongs to another account.' } }, 403);
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('refused'));
    p.rename('Theirs, changed');
    saveCurrent();
    expect(sent).toHaveLength(1);
    expect(status()).toBe('refused');
    expect(useSaveStore.getState().problem).toBe('This project belongs to another account.');
    expect(loadProject(p.id)?.name).toBe('Theirs, changed');
  });
});
