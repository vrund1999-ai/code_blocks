// Whether the open project is deployed to the server, and its latest
// workflow runs. Shown by the ☁ Server menu in the toolbar.

import { create } from 'zustand';
import { useProjectStore } from '../model/projectStore';
import { pushToast } from '../runtime/runtimeStore';
import { OfflineError } from './api';
import { deployProject, getDeployment, listRuns, undeployProject, type DeploymentSummary, type RunRecord } from './serverApi';

export type DeployStatus = 'checking' | 'none' | 'deployed' | 'offline';

interface DeployState {
  /** The project the rest is about. */
  projectId: string | null;
  status: DeployStatus;
  summary: DeploymentSummary | null;
  runs: RunRecord[];
  /** A deploy or undeploy is under way. */
  busy: boolean;
}

export const useDeployStore = create<DeployState>()(() => ({
  projectId: null,
  status: 'checking',
  summary: null,
  runs: [],
  busy: false,
}));

const currentId = () => useProjectStore.getState().project.id;

/** Applies `patch` unless another project was opened meanwhile. */
const setFor = (projectId: string, patch: Partial<DeployState>) => {
  if (currentId() === projectId) useDeployStore.setState({ projectId, ...patch });
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function describeSummary(s: DeploymentSummary): string {
  const parts = [
    s.addresses.length && plural(s.addresses.length, 'web address', 'web addresses'),
    s.forms.length && plural(s.forms.length, 'form', 'forms'),
    s.schedules.length && plural(s.schedules.length, 'schedule', 'schedules'),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'no server workflows yet';
}

/** Asks the server whether `projectId` is deployed. */
export async function refreshDeployment(projectId = currentId()) {
  if (useDeployStore.getState().projectId !== projectId) {
    useDeployStore.setState({ projectId, status: 'checking', summary: null, runs: [] });
  }
  try {
    const summary = await getDeployment(projectId);
    setFor(projectId, { status: summary ? 'deployed' : 'none', summary });
  } catch {
    setFor(projectId, { status: 'offline' });
  }
}

export async function refreshRuns(projectId = currentId()) {
  try {
    const { runs } = await listRuns(projectId);
    setFor(projectId, { runs });
  } catch {
    // The status line already says when the server can't be reached.
  }
}

async function busyWith(projectId: string, fn: () => Promise<void>) {
  setFor(projectId, { busy: true });
  try {
    await fn();
  } catch (err) {
    if (err instanceof OfflineError) setFor(projectId, { status: 'offline' });
    pushToast((err as Error).message, 'error', 5000);
  } finally {
    setFor(projectId, { busy: false });
  }
}

/** Sends the open project to the server, replacing its deployed copy. */
export function deploy() {
  const project = useProjectStore.getState().project;
  return busyWith(project.id, async () => {
    const summary = await deployProject(project);
    setFor(project.id, { status: 'deployed', summary });
    pushToast(`Deployed “${project.name || 'Untitled'}”: ${describeSummary(summary)}.`);
    if (summary.problems.length) {
      pushToast(`A server block was left out: ${summary.problems[0].message}`, 'error', 6000);
    }
    await refreshRuns(project.id);
  });
}

/** Stops the project's server workflows. Its table rows and saved values stay. */
export function undeploy() {
  const projectId = currentId();
  return busyWith(projectId, async () => {
    await undeployProject(projectId);
    setFor(projectId, { status: 'none', summary: null });
    pushToast('The project’s server workflows are stopped.');
  });
}
