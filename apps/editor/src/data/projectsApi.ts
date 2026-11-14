// Projects saved to the signed-in account (apps/server/src/projectRoutes.ts).

import type { Project } from '../model/types';
import { call } from './api';

export interface SavedProjectMeta {
  id: string;
  name: string;
  version: number;
  updatedAt: number;
}

export const PROJECTS_OFFLINE = 'Can’t reach the Code Blocks server, so your account’s projects can’t be loaded or saved.';

const url = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export async function listSaved(): Promise<SavedProjectMeta[]> {
  return (await call<{ projects: SavedProjectMeta[] }>('/api/projects', {}, PROJECTS_OFFLINE)).projects;
}

export function openSaved(id: string) {
  return call<{ project: Project; version: number; updatedAt: number }>(url(id), {}, PROJECTS_OFFLINE);
}

/**
 * Saves the project. `baseVersion` is the version it was opened at, null for
 * a new one, or 'any' to replace what's saved. Rejects with a 409 ApiError
 * when it was changed elsewhere since.
 */
export function saveToAccount(project: Project, baseVersion: number | null | 'any') {
  return call<{ version: number; updatedAt: number }>(
    url(project.id),
    { method: 'PUT', body: JSON.stringify({ project, baseVersion }) },
    PROJECTS_OFFLINE,
  );
}

export function deleteSaved(id: string) {
  return call<{ ok: true }>(url(id), { method: 'DELETE' }, PROJECTS_OFFLINE);
}
