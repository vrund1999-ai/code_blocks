import { NOT_A_PROJECT, parseProject, ProjectFormatError } from '@code-blocks/engine/project';
import type { Project } from './types';

const INDEX_KEY = 'cb.projects';
const LAST_KEY = 'cb.lastProject';
const projectKey = (id: string) => `cb.project.${id}`;

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  /**
   * Set when this is a copy of a project saved to an account, kept here
   * because it couldn't be saved there: the account's version it's based on.
   */
  accountVersion?: number;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function listProjects(): ProjectMeta[] {
  return readJSON<ProjectMeta[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Saves the project in this browser. */
export function saveProject(project: Project, accountVersion?: number) {
  localStorage.setItem(projectKey(project.id), JSON.stringify(project));
  const index = listProjects().filter((p) => p.id !== project.id);
  index.push({ id: project.id, name: project.name, updatedAt: Date.now(), ...(accountVersion ? { accountVersion } : {}) });
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export const localProject = (id: string): ProjectMeta | undefined => listProjects().find((p) => p.id === id);

/** The project opened last, wherever it's saved. */
export const lastProjectId = () => localStorage.getItem(LAST_KEY);
export const setLastProject = (id: string) => localStorage.setItem(LAST_KEY, id);

/**
 * Removes the project's copy in this browser, once it's saved to the
 * account. What the app itself saved with "Save to device" stays.
 */
export function forgetLocalCopy(id: string) {
  if (localStorage.getItem(projectKey(id)) === null) return;
  localStorage.removeItem(projectKey(id));
  localStorage.setItem(INDEX_KEY, JSON.stringify(listProjects().filter((p) => p.id !== id)));
}

/**
 * A saved project, upgraded and checked; null if there's none. Throws a
 * ProjectFormatError when what's saved can't be opened.
 */
export function loadProject(id: string): Project | null {
  const raw = localStorage.getItem(projectKey(id));
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ProjectFormatError('Its saved copy is damaged.');
  }
  return parseProject(data);
}

export function deleteProject(id: string) {
  localStorage.removeItem(projectKey(id));
  localStorage.setItem(INDEX_KEY, JSON.stringify(listProjects().filter((p) => p.id !== id)));
  // Also forget anything the app itself saved with "Save to device".
  const prefix = appStoragePrefix(id);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) localStorage.removeItem(k);
  }
}

export const appStoragePrefix = (projectId: string) => `cb.app.${projectId}.`;

/** Reads a project file: upgraded and checked, or an error saying what's wrong. */
export function parseImported(text: string): Project {
  try {
    return parseProject(JSON.parse(text));
  } catch (err) {
    const why = err instanceof ProjectFormatError ? err.message : NOT_A_PROJECT;
    throw new ProjectFormatError(`This project file can’t be opened. ${why}`);
  }
}

export function downloadProject(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^\w\- ]+/g, '').trim() || 'project'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
