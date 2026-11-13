import { PROJECT_VERSION, type Project } from './types';

const INDEX_KEY = 'cb.projects';
const LAST_KEY = 'cb.lastProject';
const projectKey = (id: string) => `cb.project.${id}`;

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
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

export function saveProject(project: Project) {
  localStorage.setItem(projectKey(project.id), JSON.stringify(project));
  const index = listProjects().filter((p) => p.id !== project.id);
  index.push({ id: project.id, name: project.name, updatedAt: Date.now() });
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  localStorage.setItem(LAST_KEY, project.id);
}

export function loadProject(id: string): Project | null {
  const p = readJSON<Project | null>(projectKey(id), null);
  return p ? migrate(p) : null;
}

export function loadLastProject(): Project | null {
  const id = localStorage.getItem(LAST_KEY);
  return id ? loadProject(id) : null;
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

/** Upgrade older saved projects to the current format. */
export function migrate(p: Project): Project {
  // Projects saved before data tables (BE-3) have no `tables`.
  return { ...p, tables: Array.isArray(p.tables) ? p.tables : [], version: PROJECT_VERSION };
}

/** Validate an imported JSON file well enough to not crash the editor. */
export function parseImported(text: string): Project {
  const data = JSON.parse(text) as Partial<Project>;
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray(data.screens) ||
    data.screens.length === 0 ||
    !Array.isArray(data.variables) ||
    (data.tables !== undefined && !Array.isArray(data.tables)) ||
    !data.graph ||
    !Array.isArray(data.graph.nodes) ||
    !Array.isArray(data.graph.edges)
  ) {
    throw new Error('This file does not look like a Code Blocks project.');
  }
  return migrate(data as Project);
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
