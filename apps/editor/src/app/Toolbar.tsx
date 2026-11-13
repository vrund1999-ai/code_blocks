import { useReactFlow } from '@xyflow/react';
import { useRef, useState } from 'react';
import {
  deleteProject,
  downloadProject,
  listProjects,
  loadProject as loadSaved,
  parseImported,
  saveProject,
} from '../model/persistence';
import { useProjectStore } from '../model/projectStore';
import { startApp, stopApp } from '../runtime/controller';
import { pushToast, useRuntimeStore } from '../runtime/runtimeStore';
import { TEMPLATES } from '../templates';
import { ServerMenu } from './ServerMenu';
import type { Project } from '../model/types';

function openProject(p: Project) {
  stopApp();
  const store = useProjectStore.getState();
  saveProject(store.project);
  store.loadProject(p);
  saveProject(p);
}

function ProjectsMenu({ onClose }: { onClose(): void }) {
  const current = useProjectStore((s) => s.project.id);
  const [projects, setProjects] = useState(listProjects);

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
      <div className="menu-title">Your projects</div>
      {projects.map((p) => (
        <div key={p.id} className={`menu-item project ${p.id === current ? 'current' : ''}`}>
          <button
            className="link"
            onClick={() => {
              const loaded = loadSaved(p.id);
              if (loaded) openProject(loaded);
              onClose();
            }}
          >
            {p.name || 'Untitled'}
            <span className="hint">{new Date(p.updatedAt).toLocaleString()}</span>
          </button>
          {p.id !== current && (
            <button
              className="icon-btn"
              title="Delete project"
              onClick={() => {
                deleteProject(p.id);
                setProjects(listProjects());
              }}
            >
              🗑
            </button>
          )}
        </div>
      ))}
    </div>
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
            openProject(parseImported(await file.text()));
          } catch (err) {
            pushToast((err as Error).message || 'Could not open that file.', 'error');
          }
        }}
      />
      <ServerMenu />
      {running ? (
        <button className="btn stop" onClick={stopApp}>
          ■ Stop
        </button>
      ) : (
        <button className="btn run" onClick={startApp}>
          ▶ Run
        </button>
      )}
    </header>
  );
}
