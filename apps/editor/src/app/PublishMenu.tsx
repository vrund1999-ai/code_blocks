// The 🔗 Publish menu: put the app on a link anyone can open, see whether
// the published copy is up to date, and take it down again.

import { useEffect, useRef, useState } from 'react';
import { openAccountMenu } from '../data/authStore';
import { appFingerprint, publishedUrl } from '../data/publishApi';
import { publish, refreshPublication, unpublish, usePublishStore } from '../data/publishStore';
import { SERVER_OFFLINE } from '../data/serverApi';
import { useProjectStore } from '../model/projectStore';
import { pushToast } from '../runtime/runtimeStore';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    pushToast('Copied the link.');
  } catch {
    pushToast('Couldn’t copy. Select the link and copy it yourself.', 'error');
  }
}

/**
 * Whether the project differs from the published copy. Only worked out while
 * it's published, and once edits pause, since dragging a block changes the
 * project many times a second.
 */
function useOutdated(published: string | null): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    if (published === null) return setOutdated(false);
    const check = () => setOutdated(appFingerprint(useProjectStore.getState().project) !== published);
    check();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useProjectStore.subscribe((s, prev) => {
      if (s.project === prev.project) return;
      clearTimeout(timer);
      timer = setTimeout(check, 300);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [published]);
  return outdated;
}

export function PublishMenu() {
  const projectId = useProjectStore((s) => s.project.id);
  const { status, info, busy, problem } = usePublishStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshPublication(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    void refreshPublication(projectId);
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, projectId]);

  const mine = usePublishStore((s) => s.projectId) === projectId;
  const published = mine && status === 'published' && info;
  const outdated = useOutdated(published ? info.fingerprint : null);
  const url = published ? publishedUrl(info.slug) : '';

  let body;
  if (!mine || status === 'checking') {
    body = (
      <p className="server-status" role="status">
        Checking the server…
      </p>
    );
  } else if (status === 'signed-out') {
    body = (
      <div className="server-sign-in">
        <p className="server-status" role="status">
          Sign in to publish your app to a link you can share.
        </p>
        <button
          className="btn run"
          onClick={() => {
            setOpen(false);
            openAccountMenu();
          }}
        >
          👤 Sign in
        </button>
      </div>
    );
  } else if (status === 'offline' || status === 'refused') {
    body = (
      <p className="server-status" role="status">
        ⚠ {status === 'offline' ? SERVER_OFFLINE : problem}
      </p>
    );
  } else {
    body = (
      <>
        <p className="server-status" role="status">
          {!published
            ? 'Not published. Publishing puts a copy of your app on a link anyone can open, without the editor.'
            : outdated
              ? `Published ${new Date(info.publishedAt).toLocaleString()}. You’ve changed the app since then; publish again so visitors see the changes.`
              : `Published ${new Date(info.publishedAt).toLocaleString()}. Visitors see the latest version.`}
        </p>
        {published && (
          <div className="publish-link">
            <code className="server-url">{url}</code>
            <button className="icon-btn" title="Copy the link" aria-label="Copy the link" onClick={() => void copy(url)}>
              ⧉
            </button>
            <a className="icon-btn" href={url} target="_blank" rel="noreferrer" title="Open the app" aria-label="Open the app">
              ↗
            </a>
          </div>
        )}
        <div className="server-actions">
          <button className="btn run" onClick={() => void publish()} disabled={busy}>
            {busy ? 'Publishing…' : published ? (outdated ? '🔗 Publish changes' : '🔗 Publish again') : '🔗 Publish'}
          </button>
          {published && (
            <button className="btn" onClick={() => void unpublish()} disabled={busy}>
              Unpublish
            </button>
          )}
        </div>
        <p className="hint">
          Visitors can see the rows of your tables but not change them. Forms and web addresses reach your deployed server
          workflows, as in the editor.
        </p>
      </>
    );
  }

  return (
    <div className="menu-anchor" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        🔗 Publish{' '}
        {published && <span className={`server-badge ${outdated ? 'outdated' : 'live'}`}>{outdated ? '● Changes not published' : '● Live'}</span>}
      </button>
      {open && (
        <div className="menu server-menu publish-menu" role="dialog" aria-label="Publish">
          {body}
        </div>
      )}
    </div>
  );
}
