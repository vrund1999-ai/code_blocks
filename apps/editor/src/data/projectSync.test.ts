import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProject } from '../model/factory';
import { lastProjectId, listProjects, loadProject, saveProject } from '../model/persistence';
import { useProjectStore } from '../model/projectStore';
import { signOut, useAuthStore } from './authStore';
import { useRuntimeStore } from '../runtime/runtimeStore';
import {
  keepThisCopy,
  markChanged,
  openFromAccount,
  openInEditor,
  openNewestCopy,
  saveBeforeClosing,
  saveCurrent,
  useSaveStore,
} from './projectSync';

const store = new Map<string, string>();
/** The bodies of the saves sent to the server. */
let sent: { project: { name: string }; baseVersion: unknown }[] = [];
/** How the fake server answers the next save. */
let answer: (method: string) => Response | Promise<Response>;
/** The addresses asked for, other than saves. */
let gets: string[] = [];
/** What the fake server was sent and answered, in order. */
let log: string[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  store.clear();
  sent = [];
  log = [];
  gets = [];
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
      else gets.push(_url);
      if (_url === '/api/auth/signout') {
        log.push('sign out sent');
        return json({ ok: true });
      }
      return answer(init.method ?? 'GET');
    }),
  );
  useAuthStore.setState({ status: 'guest', user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSaveStore.setState({ ready: false });
});

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

  it('shows the project as saved again after a change is undone before autosave', () => {
    const p = openNew('Guest app');
    p.rename('Guest app 2');
    saveCurrent();
    expect(status()).toBe('browser');
    // A change, then undo: the project is the one saved last, so there's nothing to send.
    useProjectStore.getState().setTheme({ accent: '#237032' });
    markChanged();
    useProjectStore.getState().undo();
    markChanged();
    expect(status()).toBe('pending');
    saveCurrent();
    expect(status()).toBe('browser');
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

describe('signing out', () => {
  /** Answers saves only once `release` is called. */
  function holdSaves() {
    let release = () => {};
    answer = () =>
      new Promise((resolve) => {
        release = () => {
          log.push('save answered');
          resolve(json({ version: 1, updatedAt: 1 }));
        };
      });
    return () => release();
  }

  it('first waits for a save that was already sent', async () => {
    signIn();
    const p = openNew('Almost done');
    const release = holdSaves();
    p.rename('Almost done, changed');
    saveCurrent();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const signingOut = signOut();
    await Promise.resolve();
    expect(log).toEqual([]);
    release();
    await signingOut;
    expect(log).toEqual(['save answered', 'sign out sent']);
    expect(useAuthStore.getState().status).toBe('guest');
    expect(status()).toBe('saved');
  });

  it('sends a change still waiting for autosave first', async () => {
    signIn();
    const p = openNew('Last change');
    p.rename('Last change, just typed');
    markChanged();
    const release = holdSaves();
    const signingOut = signOut();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].project.name).toBe('Last change, just typed');
    release();
    await signingOut;
    expect(log).toEqual(['save answered', 'sign out sent']);
  });
});

describe('a save that was already made', () => {
  it('counts as saved when the account already has this copy', async () => {
    signIn();
    const p = openNew('Closed tab');
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('saved'));
    p.rename('Closed tab, changed');
    const current = useProjectStore.getState().project;
    answer = (method) =>
      method === 'PUT'
        ? json({ error: { message: 'Changed in another tab.' } }, 409)
        : json({ project: current, version: 5, updatedAt: 1 });
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('saved'));
    expect(loadProject(p.id)).toBeNull();

    answer = () => json({ version: 6, updatedAt: 1 });
    p.rename('Closed tab, changed again');
    saveCurrent();
    await vi.waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2].baseVersion).toBe(5);
  });
});

describe('opening projects', () => {
  it('opens a project from the account as saved, without sending it back', () => {
    signIn();
    const p = makeProject('From the account');
    openInEditor(p, { accountVersion: 3 });
    expect(useProjectStore.getState().project.name).toBe('From the account');
    expect(status()).toBe('saved');
    expect(lastProjectId()).toBe(p.id);
    expect(sent).toEqual([]);
  });

  it('saves the open project first, then saves the new one where it belongs', async () => {
    const first = openNew('First');
    first.rename('First, changed');
    const second = makeProject('Second');
    openInEditor(second);
    expect(loadProject(first.id)?.name).toBe('First, changed');
    expect(loadProject(second.id)?.name).toBe('Second');
    expect(status()).toBe('browser');

    signIn();
    const third = makeProject('Third');
    openInEditor(third);
    await vi.waitFor(() => expect(status()).toBe('saved'));
    expect(sent.at(-1)).toMatchObject({ project: { name: 'Third' }, baseVersion: null });
  });

  it('opens the copy kept in this browser before asking the account', async () => {
    signIn();
    const kept = makeProject('Kept here');
    saveProject(kept, 2);
    await openFromAccount(kept.id);
    expect(useProjectStore.getState().project.name).toBe('Kept here');
    expect(gets).toEqual([]);
    // It is sent to the account, based on the version it was kept from.
    await vi.waitFor(() => expect(sent.at(-1)).toMatchObject({ project: { name: 'Kept here' }, baseVersion: 2 }));
  });

  it('opens a project from the account at its version', async () => {
    signIn();
    const p = makeProject('Only there');
    answer = () => json({ project: p, version: 8, updatedAt: 1 });
    await openFromAccount(p.id);
    expect(gets).toEqual([`/api/projects/${p.id}`]);
    expect(useProjectStore.getState().project.name).toBe('Only there');
    expect(status()).toBe('saved');

    answer = () => json({ version: 9, updatedAt: 1 });
    useProjectStore.getState().renameProject('Only there, changed');
    saveCurrent();
    await vi.waitFor(() => expect(sent.at(-1)?.baseVersion).toBe(8));
  });

  it('can drop the changes here for the account’s newest copy', async () => {
    signIn();
    const p = openNew('Two copies');
    p.rename('Two copies, here');
    saveProject(useProjectStore.getState().project, 1);
    const theirs = { ...makeProject('Two copies, there'), id: p.id };
    answer = () => json({ project: theirs, version: 4, updatedAt: 1 });
    await openNewestCopy();
    expect(useProjectStore.getState().project.name).toBe('Two copies, there');
    expect(status()).toBe('saved');
    expect(loadProject(p.id)).toBeNull();
  });

  it('shows why the newest copy couldn’t be opened', async () => {
    signIn();
    const p = openNew('Unreachable');
    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    await openNewestCopy();
    expect(useProjectStore.getState().project.id).toBe(p.id);
    expect(useRuntimeStore.getState().toasts.at(-1)).toMatchObject({ kind: 'error' });
  });
});

describe('closing the page', () => {
  it('keeps unsaved work in this browser', () => {
    const guest = openNew('Guest');
    guest.rename('Guest, unsaved');
    saveBeforeClosing();
    expect(loadProject(guest.id)?.name).toBe('Guest, unsaved');
  });

  it('signed in, keeps a change not yet sent, with the version it’s based on', async () => {
    signIn();
    const p = openNew('Cloud');
    saveCurrent();
    await vi.waitFor(() => expect(status()).toBe('saved'));
    saveBeforeClosing();
    // Saved already: nothing to keep.
    expect(loadProject(p.id)).toBeNull();

    p.rename('Cloud, just typed');
    saveBeforeClosing();
    expect(loadProject(p.id)?.name).toBe('Cloud, just typed');
    expect(listProjects().find((m) => m.id === p.id)?.accountVersion).toBe(1);
  });
});

describe('signing in and out', () => {
  it('signing in saves the open project to the account; signing out saves in this browser again', async () => {
    useSaveStore.setState({ ready: true });
    const p = openNew('Before signing in');
    saveCurrent();
    expect(status()).toBe('browser');

    signIn();
    await vi.waitFor(() => expect(status()).toBe('saved'));
    expect(sent).toMatchObject([{ project: { name: 'Before signing in' }, baseVersion: null }]);

    useAuthStore.setState({ status: 'guest', user: null });
    expect(status()).toBe('idle');
    p.rename('After signing out');
    saveCurrent();
    expect(status()).toBe('browser');
    expect(sent).toHaveLength(1);
  });
});
