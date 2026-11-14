import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../data/authStore';
import { deleteSaved, listSaved, type SavedProjectMeta } from '../data/projectsApi';
import { keepThisCopy, openFromAccount, openInEditor, openNewestCopy, useSaveStore } from '../data/projectSync';
import {
  deleteProject,
  downloadProject,
  listProjects,
  loadProject as loadSaved,
  parseImported,
  type ProjectMeta,
} from '../model/persistence';
import { useProjectStore } from '../model/projectStore';
import { startApp, stopApp } from '../runtime/controller';
import { pushToast, useRuntimeStore } from '../runtime/runtimeStore';
import { TEMPLATES } from '../templates';
import { AccountMenu } from './AccountMenu';
import { PublishMenu } from './PublishMenu';
import { ServerMenu } from './ServerMenu';
import type { Project } from '../model/types';

/** Opens a project; `replace` saves it over the account's copy, for imported files. */
function openProject(p: Project, replace = false) {
  stopApp();
  openInEditor(p, { replace });
}

const showError = (name: string, err: unknown) =>
  pushToast(`“${name || 'Untitled'}” can’t be opened. ${(err as Error).message}`, 'error', 8000);

function ProjectRow({
  project,
  current,
  onOpen,
  onDelete,
}: {
  project: Pick<ProjectMeta, 'id' | 'name' | 'updatedAt'>;
  current: boolean;
  onOpen(): void;
  onDelete(): void;
}) {
  return (
    <div className={`menu-item project ${current ? 'current' : ''}`}>
      <button className="link" onClick={onOpen}>
        {project.name || 'Untitled'}
        <span className="hint">{new Date(project.updatedAt).toLocaleString()}</span>
      </button>
      {!current && (
        <button className="icon-btn" title="Delete project" onClick={onDelete}>
          🗑
        </button>
      )}
    </div>
  );
}

function ProjectsMenu({ onClose }: { onClose(): void }) {
  const current = useProjectStore((s) => s.project.id);
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const [local, setLocal] = useState(listProjects);
  const [account, setAccount] = useState<SavedProjectMeta[] | null>(null);
  const [accountProblem, setAccountProblem] = useState('');

  useEffect(() => {
    if (!signedIn) return;
    listSaved().then(setAccount, (err: Error) => setAccountProblem(err.message));
  }, [signedIn]);

  const openLocal = (p: ProjectMeta) => {
    try {
      const loaded = loadSaved(p.id);
      if (loaded) openProject(loaded);
    } catch (err) {
      showError(p.name, err);
    }
    onClose();
  };
  const localRow = (p: ProjectMeta) => (
    <ProjectRow
      key={p.id}
      project={p}
      current={p.id === current}
      onOpen={() => openLocal(p)}
      onDelete={() => {
        deleteProject(p.id);
        setLocal(listProjects());
      }}
    />
  );
  const browserOnly = local.filter((p) => !account?.some((a) => a.id === p.id));

  return (
    <div className="menu" onMouseLeave={onClose}>
      <div className="menu-title">Start something new</div>
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          className="menu-item"
          onClick={() => {
            openProject(t.create());
            onClose();
          }}
        >
          <b>{t.name}</b>
          <span className="hint">{t.description}</span>
        </button>
      ))}
      {signedIn ? (
        <>
          <div className="menu-title">On your account</div>
          {account === null ? (
            <p className="hint menu-note" role="status">
              {accountProblem ? `⚠ ${accountProblem}` : 'Loading your projects…'}
            </p>
          ) : account.length === 0 ? (
            <p className="hint menu-note">Nothing saved yet. The projects you work on are saved here.</p>
          ) : (
            account.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                current={p.id === current}
                onOpen={() => {
                  openFromAccount(p.id).catch((err) => showError(p.name, err));
                  onClose();
                }}
                onDelete={async () => {
                  try {
                    await deleteSaved(p.id);
                    deleteProject(p.id);
                    setAccount((list) => list && list.filter((a) => a.id !== p.id));
                    setLocal(listProjects());
                  } catch (err) {
                    pushToast((err as Error).message, 'error', 5000);
                  }
                }}
              />
            ))
          )}
          {account !== null && browserOnly.length > 0 && (
            <>
              <div className="menu-title">In this browser only</div>
              <p className="hint menu-note">Opening one saves it to your account.</p>
              {browserOnly.map(localRow)}
            </>
          )}
        </>
      ) : (
        <>
          <div className="menu-title">Your projects</div>
          {local.map(localRow)}
          <p className="hint menu-note">Saved in this browser. Sign in to keep projects on your account and open them anywhere.</p>
        </>
      )}
    </div>
  );
}

/** Says where the open project is saved, and asks what to do when it was changed elsewhere. */
function SaveIndicator() {
  const { status, problem } = useSaveStore();
  const [open, setOpen] = useState(false);
  if (status === 'idle') return null;
  if (status === 'conflict') {
    return (
      <div className="menu-anchor">
        <button className="save-status problem" onClick={() => setOpen(!open)} aria-expanded={open}>
          ⚠ Changed somewhere else
        </button>
        {open && (
          <div className="menu save-conflict" role="dialog" aria-label="Which copy to keep">
            <p>{problem}</p>
            <p className="hint">Your changes here are kept in this browser until you choose.</p>
            <button
              className="btn"
              onClick={() => {
                setOpen(false);
                void openNewestCopy();
              }}
            >
              Open the newest copy
            </button>
            <button
              className="btn"
              onClick={() => {
                setOpen(false);
                keepThisCopy();
              }}
            >
              Keep this copy
            </button>
          </div>
        )}
      </div>
    );
  }
  const [text, title] = {
    pending: ['Saving…', ''],
    saving: ['Saving…', ''],
    browser: ['Saved in this browser', 'Sign in to keep projects on your account and open them in any browser.'],
    saved: ['☁ Saved to your account', ''],
    offline: ['⚠ Not saved to your account', `${problem} It’s kept in this browser for now.`],
    refused: ['⚠ Kept in this browser', problem],
  }[status];
  return (
    <span className={`save-status ${text.startsWith('⚠') ? 'problem' : ''}`} role="status" title={title || undefined}>
      {text}
    </span>
  );
}

export function Toolbar() {
  const name = useProjectStore((s) => s.project.name);
  const tab = useProjectStore((s) => s.tab);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const { renameProject, setTab, undo, redo, select } = useProjectStore.getState();
  const running = useRuntimeStore((s) => s.running);
  const error = useRuntimeStore((s) => s.error);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rf = useReactFlow();

  const showErrorBlock = () => {
    if (!error) return;
    setTab('logic');
    select({ kind: 'node', id: error.nodeId });
    setTimeout(() => rf.fitView({ nodes: [{ id: error.nodeId }], duration: 300, maxZoom: 1 }), 50);
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo">◆</span> Code Blocks
      </div>
      <div className="menu-anchor">
        <button className="btn" onClick={() => setMenu(!menu)}>
          📁 Projects ▾
        </button>
        {menu && <ProjectsMenu onClose={() => setMenu(false)} />}
      </div>
      <input className="project-name" value={name} onChange={(e) => renameProject(e.target.value)} aria-label="Project name" />
      <SaveIndicator />

      <div className="tabs">
        <button className={`tab ${tab === 'design' ? 'active' : ''}`} onClick={() => setTab('design')}>
          🎨 Design
        </button>
        <button className={`tab ${tab === 'logic' ? 'active' : ''}`} onClick={() => setTab('logic')}>
          ⚡ Logic
        </button>
        <button className={`tab ${tab === 'data' ? 'active' : ''}`} onClick={() => setTab('data')}>
          ▦ Data
        </button>
      </div>

      <div className="spacer" />
      {error && (
        <button className="error-pill" onClick={showErrorBlock} title={error.message}>
          ⚠ Problem in a block — show me
        </button>
      )}
      <button className="btn icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        ↶
      </button>
      <button className="btn icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        ↷
      </button>
      <button className="btn" onClick={() => downloadProject(useProjectStore.getState().project)} title="Download as a file">
        ⬇ Export
      </button>
      <button className="btn" onClick={() => fileRef.current?.click()} title="Open a project file">
        ⬆ Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            openProject(parseImported(await file.text()), true);
          } catch (err) {
            pushToast((err as Error).message || 'Could not open that file.', 'error');
          }
        }}
      />
      <ServerMenu />
      <PublishMenu />
      {running ? (
        <button className="btn stop" onClick={stopApp}>
          ■ Stop
        </button>
      ) : (
        <button className="btn run" onClick={startApp}>
          ▶ Run
        </button>
      )}
      <AccountMenu />
    </header>
  );
}
