// Publishing a project to a link anyone can open, and what a published app
// asks the server for (apps/server/src/publishRoutes.ts).

import type { Project } from '../model/types';
import { call } from './api';
import type { RowPage } from './rowsApi';
import { hashOf, SERVER_OFFLINE } from './serverApi';

export interface PublicationInfo {
  slug: string;
  publishedAt: string;
  fingerprint: string;
}

/** What a published app is made of. Where blocks sit in the Logic tab doesn't change what it does, so it's left out. */
const publishedParts = (p: Project) => ({
  name: p.name,
  screens: p.screens,
  variables: p.variables,
  tables: p.tables,
  nodes: p.graph.nodes.map(({ position: _, ...n }) => n),
  edges: p.graph.edges,
});

/** Changes whenever anything visitors would see does, so the editor can say when the published copy is out of date. */
export const appFingerprint = (p: Project) => hashOf(publishedParts(p));

/** The link to a published app. */
export const publishedUrl = (slug: string) => `${location.origin}/app/${slug}`;

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/publication`;

export async function getPublication(projectId: string): Promise<PublicationInfo | null> {
  const res = await call<{ published: boolean } & PublicationInfo>(base(projectId), {}, SERVER_OFFLINE);
  return res.published ? res : null;
}

export const publishProject = (p: Project) =>
  call<PublicationInfo>(base(p.id), { method: 'PUT', body: JSON.stringify({ project: p, fingerprint: appFingerprint(p) }) }, SERVER_OFFLINE);

export const unpublishProject = (projectId: string) => call<{ ok: true }>(base(projectId), { method: 'DELETE' }, SERVER_OFFLINE);

export const PUBLISHED_OFFLINE = 'Can’t reach the Code Blocks server, so this app can’t be opened. Try again in a moment.';

/** A published app, for its visitors. */
export const openPublished = (slug: string) =>
  call<{ project: Project; publishedAt: string }>(`/api/published/${encodeURIComponent(slug)}`, {}, PUBLISHED_OFFLINE);

export const listPublishedRows = (slug: string, tableId: string, offset: number, limit: number) =>
  call<RowPage>(
    `/api/published/${encodeURIComponent(slug)}/tables/${encodeURIComponent(tableId)}/rows?limit=${limit}&offset=${offset}`,
    {},
    PUBLISHED_OFFLINE,
  );
