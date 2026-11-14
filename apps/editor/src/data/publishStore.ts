// Whether the open project is published to a link, for the 🔗 Publish menu.

import { create } from 'zustand';
import { useProjectStore } from '../model/projectStore';
import { pushToast } from '../runtime/runtimeStore';
import { OfflineError } from './api';
import { useAuthStore } from './authStore';
import { getPublication, publishProject, unpublishProject, type PublicationInfo } from './publishApi';

/**
 * `signed-out`: publishing needs an account, so the server isn't asked.
 * `refused`: the server said no, such as for another account's project; `problem` says why.
 */
export type PublishStatus = 'checking' | 'none' | 'published' | 'offline' | 'signed-out' | 'refused';

interface PublishState {
  /** The project the rest is about. */
  projectId: string | null;
  status: PublishStatus;
  info: PublicationInfo | null;
  /** Publishing or taking down is under way. */
  busy: boolean;
  problem: string;
}

export const usePublishStore = create<PublishState>()(() => ({
  projectId: null,
  status: 'checking',
  info: null,
  busy: false,
  problem: '',
}));

const currentId = () => useProjectStore.getState().project.id;

/** Applies `patch` unless another project was opened meanwhile. */
const setFor = (projectId: string, patch: Partial<PublishState>) => {
  if (currentId() === projectId) usePublishStore.setState({ projectId, ...patch });
};

/** Asks the server whether `projectId` is published. */
export async function refreshPublication(projectId = currentId()) {
  if (usePublishStore.getState().projectId !== projectId) {
    usePublishStore.setState({ projectId, status: 'checking', info: null });
  }
  const auth = useAuthStore.getState().status;
  if (auth === 'checking') return;
  if (auth !== 'signed-in') return setFor(projectId, { status: auth === 'offline' ? 'offline' : 'signed-out', info: null });
  try {
    const info = await getPublication(projectId);
    setFor(projectId, { status: info ? 'published' : 'none', info });
  } catch (err) {
    if (err instanceof OfflineError) setFor(projectId, { status: 'offline' });
    else setFor(projectId, { status: 'refused', info: null, problem: (err as Error).message });
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

/** Publishes the open project, replacing the copy at its link. */
export function publish() {
  const project = useProjectStore.getState().project;
  const again = usePublishStore.getState().status === 'published';
  return busyWith(project.id, async () => {
    const info = await publishProject(project);
    setFor(project.id, { status: 'published', info });
    pushToast(again ? 'Published your changes. Visitors see them the next time they open the link.' : 'Published! Anyone with the link can use your app.');
  });
}

/** Takes the open project off its link. */
export function unpublish() {
  const projectId = currentId();
  return busyWith(projectId, async () => {
    await unpublishProject(projectId);
    setFor(projectId, { status: 'none', info: null });
    pushToast('Unpublished. The link doesn’t open the app any more.');
  });
}

// Signing in or out changes what the server shows.
useAuthStore.subscribe((s, prev) => {
  if (s.status !== prev.status || s.user?.id !== prev.user?.id) void refreshPublication();
});
