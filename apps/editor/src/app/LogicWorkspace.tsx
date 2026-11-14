// The Logic tab: the block palette, the graph and the live preview. It's
// loaded on its own (see App), since React Flow is most of the editor's size.

import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useState } from 'react';
import { DeviceFrame } from '../designer/DesignCanvas';
import { LogicCanvas } from '../logic/LogicCanvas';
import { NodePalette } from '../logic/NodePalette';
import { RunLog } from '../logic/RunLog';
import { useProjectStore } from '../model/projectStore';
import { AppView } from '../runtime/Renderer';
import { useRuntimeStore } from '../runtime/runtimeStore';
import { Inspector } from './Inspector';
import { VariablesPanel } from './SidePanels';

export function LogicWorkspace() {
  return (
    <ReactFlowProvider>
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
    </ReactFlowProvider>
  );
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
