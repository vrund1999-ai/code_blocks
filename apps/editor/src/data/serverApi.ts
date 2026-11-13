// Deploying a project and talking to its server workflows
// (apps/server/src/workflowRoutes.ts).

import type { Project } from '../model/types';
import { call } from './api';

/** What the deployed copy of a project answers to. */
export interface DeploymentSummary {
  name: string;
  deployedAt: string;
  /** fingerprint() of the project when it was deployed. */
  fingerprint: string;
  addresses: { method: string; path: string }[];
  forms: string[];
  schedules: string[];
  /** Server blocks the server left out because their settings have a problem. */
  problems: { nodeId: string; message: string }[];
}

export interface RunRecord {
  at: string;
  trigger: string;
  ok: boolean;
  error?: { nodeId: string; message: string };
  messages: string[];
}

export interface FormResult {
  ok: boolean;
  error?: { nodeId: string; message: string };
  messages: string[];
  reply: unknown;
}

export const SERVER_OFFLINE = 'Can’t reach the Code Blocks server. Start it with “npm run dev:server”.';

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

/** The parts of a project the server runs. */
const deployedParts = (p: Project) => ({ graph: p.graph, variables: p.variables, tables: p.tables });

/**
 * A short code that changes whenever the deployed parts of the project do,
 * so the editor can tell when the deployed copy is out of date.
 */
export function fingerprint(p: Project): string {
  const text = JSON.stringify(deployedParts(p));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${text.length}`;
}

/** The project's deployment, or null when it isn't deployed. */
export async function getDeployment(projectId: string): Promise<DeploymentSummary | null> {
  const res = await call<{ deployed: boolean } & DeploymentSummary>(`${base(projectId)}/deployment`, {}, SERVER_OFFLINE);
  return res.deployed ? res : null;
}

export const deployProject = (p: Project) =>
  call<DeploymentSummary>(
    `${base(p.id)}/deployment`,
    { method: 'PUT', body: JSON.stringify({ name: p.name, fingerprint: fingerprint(p), ...deployedParts(p) }) },
    SERVER_OFFLINE,
  );

export const undeployProject = (projectId: string) =>
  call<{ ok: true }>(`${base(projectId)}/deployment`, { method: 'DELETE' }, SERVER_OFFLINE);

export const listRuns = (projectId: string) => call<{ runs: RunRecord[] }>(`${base(projectId)}/runs`, {}, SERVER_OFFLINE);

export const sendForm = (projectId: string, form: string, values: Record<string, unknown>) =>
  call<FormResult>(
    `${base(projectId)}/forms/${encodeURIComponent(form)}`,
    { method: 'POST', body: JSON.stringify({ values }) },
    SERVER_OFFLINE,
  );

/** The full address of one of the project's web addresses. */
export const hookUrl = (projectId: string, path: string) =>
  `${location.origin}/api/hooks/${encodeURIComponent(projectId)}/${path}`;
