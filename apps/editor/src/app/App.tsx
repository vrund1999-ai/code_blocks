import { lazy, Suspense, useEffect } from 'react';
import { ComponentPalette } from '../designer/ComponentPalette';
import { DesignCanvas } from '../designer/DesignCanvas';
import { DesignDnd } from '../designer/DesignDnd';
import { LayersPanel } from '../designer/LayersPanel';
import { useProjectStore } from '../model/projectStore';
import { stopApp } from '../runtime/controller';
import { boot, markChanged, openedStarter, saveBeforeClosing, saveCurrent, useSaveStore } from '../data/projectSync';
import { pushToast, useRuntimeStore } from '../runtime/runtimeStore';
import { DataView } from './DataView';
import { Inspector } from './Inspector';
import { ScreensPanel, VariablesPanel } from './SidePanels';
import { Toolbar } from './Toolbar';
import { offerTutorialOnce, Tutorial } from './Tutorial';

// The Logic tab, with React Flow, is loaded on its own: once the editor is
// open, or right away when it's opened first.
const loadLogic = () => import('./LogicWorkspace');
const LogicWorkspace = lazy(() => loadLogic().then((m) => ({ default: m.LogicWorkspace })));

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function useBootAndAutosave() {
  useEffect(() => {
    void boot();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useProjectStore.subscribe((s, prev) => {
      if (s.project === prev.project || !useSaveStore.getState().ready) return;
      markChanged();
      clearTimeout(timer);
      timer = setTimeout(() => saveCurrent(), 400);
    });
    window.addEventListener('beforeunload', saveBeforeClosing);
    return () => {
      unsub();
      clearTimeout(timer);
      window.removeEventListener('beforeunload', saveBeforeClosing);
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

function GlobalToasts() {
  const running = useRuntimeStore((s) => s.running);
  const toasts = useRuntimeStore((s) => s.toasts);
  if (running || toasts.length === 0) return null;
  return (
    <div className="global-toasts" role="region" aria-label="Notifications" aria-live="polite">
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
  const ready = useSaveStore((s) => s.ready);
  useEffect(() => {
    if (!ready) return;
    void loadLogic();
    // A first visit offers the tutorial, once.
    if (openedStarter()) offerTutorialOnce();
  }, [ready]);

  if (!ready) {
    return (
      <div className="app boot" role="status">
        Opening your project…
      </div>
    );
  }
  return (
    <div className="app">
      <Toolbar />
      {tab === 'design' ? (
        <DesignDnd>
          <main className="workspace">
            <aside className="sidebar" aria-label="Elements, screens and variables">
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
        <Suspense fallback={<main className="workspace" aria-busy="true" />}>
          <LogicWorkspace />
        </Suspense>
      )}
      <GlobalToasts />
      <Tutorial />
    </div>
  );
}
