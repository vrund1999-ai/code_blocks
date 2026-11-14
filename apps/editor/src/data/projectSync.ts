// Where the open project is saved. Guests' projects are saved in this
// browser. Signed in, the project is saved to the account on the server
// (data/projectsApi.ts), so it can be opened from any browser; a copy is
// kept in this browser only while it can't be saved there.
//
// Each save to the account says which version it was based on, so a copy
// changed in another tab or browser isn't overwritten without asking.

import { parseProject } from '@code-blocks/engine/project';
import { create } from 'zustand';
import {
  forgetLocalCopy,
  lastProjectId,
  loadProject as loadLocal,
  localProject,
  saveProject as saveLocal,
  setLastProject,
} from '../model/persistence';
import { useProjectStore } from '../model/projectStore';
import type { Project } from '../model/types';
import { pushToast } from '../runtime/runtimeStore';
import { TEMPLATES } from '../templates';
import { ApiError, OfflineError } from './api';
import { refreshAuth, useAuthStore } from './authStore';
import { openSaved, saveToAccount } from './projectsApi';

/**
 * - `idle`: nothing to say, such as for a new project not changed yet.
 * - `pending`: changed, and about to be saved.
 * - `browser`: saved in this browser (signed out).
 * - `saving` / `saved`: to the account.
 * - `offline`: the server can't be reached; kept in this browser for now.
 * - `refused`: the server won't save it (`problem` says why); kept in this browser.
 * - `conflict`: it was changed in another tab or browser. Saving waits until
 *   the person picks which copy to keep.
 */
export type SaveStatus = 'idle' | 'pending' | 'browser' | 'saving' | 'saved' | 'offline' | 'refused' | 'conflict';

interface SaveState {
  /** The open project is ready; until then the editor shows a loading message. */
  ready: boolean;
  status: SaveStatus;
  problem: string;
}

export const useSaveStore = create<SaveState>()(() => ({ ready: false, status: 'idle', problem: '' }));

/** The account's version of each project, as last opened or saved here. */
const versions = new Map<string, number>();
/** Projects the server refused to save because they're another account's. */
const refused = new Set<string>();
/** The project as last saved, so unchanged projects aren't sent again. */
let lastSaved: Project | null = null;
let queued: { project: Project; replace: boolean } | null = null;
/** The open project is the starter one opened on boot, not changed yet, so it isn't kept anywhere. */
let starter = false;
let pushing = false;

const signedIn = () => useAuthStore.getState().status === 'signed-in';
const openId = () => useProjectStore.getState().project.id;
const setStatus = (projectId: string, status: SaveStatus, problem = '') => {
  if (openId() === projectId) useSaveStore.setState({ status, problem });
};

/** The account's version the copy here is based on; null if it was never saved there. */
const baseVersion = (id: string) => versions.get(id) ?? localProject(id)?.accountVersion ?? null;

/** Keeps the project in this browser, remembering the account's version it's based on. */
const keepHere = (project: Project) => saveLocal(project, baseVersion(project.id) ?? undefined);

/** Marks the open project as changed, before autosave waits a moment to save it. */
export function markChanged() {
  starter = false;
  if (useSaveStore.getState().status !== 'conflict') useSaveStore.setState({ status: 'pending', problem: '' });
}

/**
 * Saves the open project where it belongs. `replace` saves it to the account
 * even when it was changed elsewhere.
 */
export function saveCurrent({ replace = false } = {}) {
  const project = useProjectStore.getState().project;
  if (project === lastSaved && !replace) return;
  lastSaved = project;
  starter = false;
  setLastProject(project.id);
  if (!signedIn()) {
    keepHere(project);
    return setStatus(project.id, 'browser');
  }
  const { status, problem } = useSaveStore.getState();
  if (refused.has(project.id)) {
    keepHere(project);
    return setStatus(project.id, 'refused', problem);
  }
  if (status === 'conflict' && !replace) return keepHere(project);
  queued = { project, replace };
  void push();
}

async function push() {
  if (pushing) return;
  pushing = true;
  try {
    while (queued) {
      const { project, replace } = queued;
      queued = null;
      setStatus(project.id, 'saving');
      try {
        const { version } = await saveToAccount(project, replace ? 'any' : baseVersion(project.id));
        versions.set(project.id, version);
        forgetLocalCopy(project.id);
        if (!queued) setStatus(project.id, 'saved');
      } catch (err) {
        await failed(project, err);
      }
    }
  } finally {
    pushing = false;
  }
}

async function failed(project: Project, err: unknown) {
  if (err instanceof ApiError && err.status === 409) {
    // Already saved, such as by a save that finished as the page was closed.
    try {
      const saved = await openSaved(project.id);
      if (JSON.stringify(saved.project) === JSON.stringify(project)) {
        versions.set(project.id, saved.version);
        forgetLocalCopy(project.id);
        return setStatus(project.id, 'saved');
      }
    } catch {
      // Treated as changed elsewhere.
    }
    keepHere(project);
    if (queued?.project.id === project.id && !queued.replace) {
      keepHere(queued.project);
      queued = null;
    }
    return setStatus(project.id, 'conflict', err.message);
  }
  keepHere(project);
  if (err instanceof OfflineError) return setStatus(project.id, 'offline', err.message);
  if (err instanceof ApiError && err.status === 403) refused.add(project.id);
  setStatus(project.id, 'refused', (err as Error).message);
}

/**
 * Opens a project in the editor, first saving the one that's open.
 * `accountVersion` is set for a project just opened from the account. Any
 * other project is saved right away: to the account when signed in.
 */
export function openInEditor(project: Project, { accountVersion, replace = false }: { accountVersion?: number; replace?: boolean } = {}) {
  saveCurrent();
  starter = false;
  useProjectStore.getState().loadProject(project);
  useSaveStore.setState({ status: 'idle', problem: '' });
  if (accountVersion !== undefined) {
    versions.set(project.id, accountVersion);
    lastSaved = useProjectStore.getState().project;
    setLastProject(project.id);
    setStatus(project.id, 'saved');
  } else {
    saveCurrent({ replace });
  }
}

/**
 * Opens a project from the account, or the copy kept in this browser when
 * one couldn't be saved there yet. Rejects with a message to show.
 */
export async function openFromAccount(id: string) {
  const local = localProject(id) ? loadLocal(id) : null;
  if (local) return openInEditor(local);
  const saved = await openSaved(id);
  openInEditor(parseProject(saved.project), { accountVersion: saved.version });
}

/** Opens the account's copy of the open project, dropping the changes made here. */
export async function openNewestCopy() {
  const id = openId();
  try {
    const saved = await openSaved(id);
    forgetLocalCopy(id);
    lastSaved = null;
    useSaveStore.setState({ status: 'idle', problem: '' });
    useProjectStore.getState().loadProject(parseProject(saved.project));
    versions.set(id, saved.version);
    lastSaved = useProjectStore.getState().project;
    setStatus(id, 'saved');
  } catch (err) {
    pushToast((err as Error).message, 'error', 5000);
  }
}

/** Saves the copy here to the account, replacing the one changed elsewhere. */
export function keepThisCopy() {
  useSaveStore.setState({ status: 'saving', problem: '' });
  saveCurrent({ replace: true });
}

/** Before the page closes: work that wasn't sent yet is kept in this browser. */
export function saveBeforeClosing() {
  const project = useProjectStore.getState().project;
  if (!signedIn()) return project === lastSaved ? undefined : saveLocal(project);
  if (project !== lastSaved || useSaveStore.getState().status !== 'saved') keepHere(project);
}

let booting: Promise<void> | null = null;

/** Finds who is signed in and opens the project opened last. Runs once. */
export const boot = () => (booting ??= openLast());

async function openLast() {
  await refreshAuth();
  const id = lastProjectId();
  let project: Project | null = null;
  try {
    project = id ? loadLocal(id) : null;
    if (!project && id && signedIn()) {
      try {
        const saved = await openSaved(id);
        project = parseProject(saved.project);
        versions.set(id, saved.version);
        lastSaved = null;
        useProjectStore.getState().loadProject(project);
        lastSaved = useProjectStore.getState().project;
        useSaveStore.setState({ ready: true, status: 'saved' });
        return;
      } catch (err) {
        // Gone, or another account's: start something new instead.
        if (!(err instanceof ApiError && (err.status === 404 || err.status === 403))) throw err;
        project = null;
      }
    }
  } catch (err) {
    // Start with a template instead; a copy in this browser stays in the Projects menu.
    pushToast(`Your last project couldn’t be opened. ${(err as Error).message}`, 'error', 8000);
  }
  if (project) {
    lastSaved = useProjectStore.getState().project;
    openInEditor(project);
  } else {
    useProjectStore.getState().loadProject(TEMPLATES.find((t) => t.id === 'hello')!.create());
    lastSaved = useProjectStore.getState().project;
    starter = true;
  }
  useSaveStore.setState({ ready: true });
}

// Signing in saves the open project to the account; signing out stops
// saving it there.
useAuthStore.subscribe((s, prev) => {
  if (!useSaveStore.getState().ready || s.user?.id === prev.user?.id) return;
  refused.clear();
  versions.clear();
  useSaveStore.setState({ status: 'idle', problem: '' });
  if (s.status === 'signed-in') {
    // An untouched starter project isn't kept anywhere, so it isn't sent either.
    if (!starter) {
      lastSaved = null;
      saveCurrent();
    }
  } else {
    // Saved in this browser from the next change on.
    lastSaved = useProjectStore.getState().project;
  }
});
