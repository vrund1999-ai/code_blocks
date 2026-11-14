import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { ComponentPalette } from '../designer/ComponentPalette';
import { DesignCanvas, DeviceFrame } from '../designer/DesignCanvas';
import { DesignDnd } from '../designer/DesignDnd';
import { LayersPanel } from '../designer/LayersPanel';
import { LogicCanvas } from '../logic/LogicCanvas';
import { NodePalette } from '../logic/NodePalette';
import { RunLog } from '../logic/RunLog';
import { loadLastProject, saveProject } from '../model/persistence';
import { useProjectStore } from '../model/projectStore';
import { stopApp } from '../runtime/controller';
import { AppView } from '../runtime/Renderer';
import { refreshAuth } from '../data/authStore';
import { pushToast, useRuntimeStore } from '../runtime/runtimeStore';
import { TEMPLATES } from '../templates';
import { DataView } from './DataView';
import { Inspector } from './Inspector';
import { ScreensPanel, VariablesPanel } from './SidePanels';
import { Toolbar } from './Toolbar';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function useBootAndAutosave() {
  useEffect(() => {
    void refreshAuth();
    let last = null;
    try {
      last = loadLastProject();
    } catch (err) {
      // Start with a template instead; the saved copy stays in the Projects menu.
      pushToast(`Your last project couldn’t be opened. ${(err as Error).message}`, 'error', 8000);
    }
    useProjectStore.getState().loadProject(last ?? TEMPLATES.find((t) => t.id === 'hello')!.create());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useProjectStore.subscribe((s, prev) => {
      if (s.project === prev.project) return;
      clearTimeout(timer);
      timer = setTimeout(() => saveProject(useProjectStore.getState().project), 400);
    });
    const flush = () => saveProject(useProjectStore.getState().project);
    window.addEventListener('beforeunload', flush);
    return () => {
      unsub();
      clearTimeout(timer);
      window.removeEventListener('beforeunload', flush);
      stopApp();
    };
  }, []);
}

const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** "“Say Hello”" or "3 blocks": what the clipboard holds, for messages. */
function clipName(): string {
  const clip = useProjectStore.getState().clipboard;
  if (!clip) return 'nothing';
  if (clip.kind === 'elements') return `“${clip.elements[0].name}”`;
  return clip.nodes.length === 1 ? 'a block' : `${clip.nodes.length} blocks`;
}

/** Copy, cut, paste and duplicate for the selected element or blocks. */
function clipboardShortcut(e: KeyboardEvent): boolean {
  const s = useProjectStore.getState();
  const key = e.key.toLowerCase();
  // Let the browser copy text the user has highlighted, such as in the preview.
  if ((key === 'c' || key === 'x') && window.getSelection()?.toString()) return false;
  if (key === 'c' || key === 'x') {
    const n = key === 'c' ? s.copySelection() : s.cutSelection();
    if (!n) return false;
    pushToast(`${key === 'c' ? 'Copied' : 'Cut'} ${clipName()}. Press ${MOD_KEY}+V to paste.`);
  } else if (key === 'v') {
    if (!s.clipboard) return false;
    if (!s.paste().length) {
      pushToast(
        s.clipboard.kind === 'elements'
          ? 'Elements can be pasted in the Design tab.'
          : 'Blocks can be pasted in the Logic tab.',
      );
    }
  } else if (key === 'd') {
    s.duplicateSelection();
  } else {
    return false;
  }
  return true;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = useProjectStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && !e.shiftKey && !e.altKey && 'cxvd'.includes(e.key.toLowerCase()) && e.key.length === 1) {
        // Ctrl+D would bookmark the page, so it is always taken.
        if (clipboardShortcut(e) || e.key.toLowerCase() === 'd') e.preventDefault();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.tab === 'design' && s.selection?.kind === 'element') {
        e.preventDefault();
        s.deleteElement(s.selection.id);
      } else if (e.key === 'Escape') {
        s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Live app preview docked beside the logic graph, with the run log under it. */
function LogicPreview() {
  const running = useRuntimeStore((s) => s.running);
  const runScreen = useRuntimeStore((s) => s.screenId);
  const screenId = useProjectStore((s) => s.activeScreenId);
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button className="preview-tab" onClick={() => setOpen(true)}>
        📱 Show preview
      </button>
    );
  }
  return (
    <div className="logic-preview">
      <div className="logic-preview-head">
        <span>{running ? '▶ Your app (running)' : 'Preview'}</span>
        <button className="icon-btn" onClick={() => setOpen(false)} title="Hide preview">
          ✕
        </button>
      </div>
      {!running && <p className="hint">Press ▶ Run, then use the app here and watch your blocks light up.</p>}
      <div className="logic-preview-body">
        <DeviceFrame device="phone" title={running ? 'Running' : 'Preview'}>
          <AppView screenId={running && runScreen ? runScreen : screenId} mode={running ? 'run' : 'static'} />
        </DeviceFrame>
      </div>
      <RunLog />
    </div>
  );
}

function GlobalToasts() {
  const running = useRuntimeStore((s) => s.running);
  const toasts = useRuntimeStore((s) => s.toasts);
  if (running || toasts.length === 0) return null;
  return (
    <div className="global-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function App() {
  useBootAndAutosave();
  useShortcuts();
  const tab = useProjectStore((s) => s.tab);

  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />
        {tab === 'design' ? (
          <DesignDnd>
            <main className="workspace">
              <aside className="sidebar">
                <ComponentPalette />
                <ScreensPanel />
                <LayersPanel />
                <VariablesPanel />
              </aside>
              <DesignCanvas />
              <Inspector />
            </main>
          </DesignDnd>
        ) : tab === 'data' ? (
          <DataView />
        ) : (
          <main className="workspace">
            <aside className="sidebar">
              <NodePalette />
              <VariablesPanel />
            </aside>
            <div className="logic-area">
              <LogicCanvas />
              <LogicPreview />
            </div>
            <Inspector />
          </main>
        )}
        <GlobalToasts />
      </div>
    </ReactFlowProvider>
  );
}
