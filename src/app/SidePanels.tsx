import { useState } from 'react';
import { toList, toText } from '../engine/convert';
import { useProjectStore } from '../model/projectStore';
import type { Variable } from '../model/types';
import { useRuntimeStore } from '../runtime/runtimeStore';

const TYPE_LABELS: Record<Variable['type'], string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Yes / No',
  list: 'List',
};

function InitialEditor({ v }: { v: Variable }) {
  const updateVariable = useProjectStore((s) => s.updateVariable);
  switch (v.type) {
    case 'number':
      return (
        <input
          type="number"
          className="field-input"
          value={String(v.initial ?? 0)}
          onChange={(e) => updateVariable(v.id, { initial: Number(e.target.value) })}
        />
      );
    case 'boolean':
      return (
        <select
          className="field-input"
          value={v.initial ? 'true' : 'false'}
          onChange={(e) => updateVariable(v.id, { initial: e.target.value === 'true' })}
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    case 'list':
      return (
        <textarea
          className="field-input"
          rows={2}
          placeholder="One item per line"
          value={toList(v.initial).map(toText).join('\n')}
          onChange={(e) => updateVariable(v.id, { initial: e.target.value.split('\n').filter((l) => l !== '') })}
        />
      );
    default:
      return (
        <input
          className="field-input"
          value={toText(v.initial)}
          onChange={(e) => updateVariable(v.id, { initial: e.target.value })}
        />
      );
  }
}

export function VariablesPanel() {
  const variables = useProjectStore((s) => s.project.variables);
  const { addVariable, updateVariable, deleteVariable } = useProjectStore.getState();
  const running = useRuntimeStore((s) => s.running);
  const live = useRuntimeStore((s) => s.vars);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="panel-section">
      <h3>Variables</h3>
      <p className="hint">Boxes that remember a value while your app runs.</p>
      {variables.map((v) => (
        <div key={v.id} className="var-item">
          <div className="var-row" onClick={() => setOpen(open === v.id ? null : v.id)}>
            <span className={`var-type t-${v.type}`}>{TYPE_LABELS[v.type]}</span>
            <span className="var-name">{v.name}</span>
            {running && <span className="var-live" title="Current value">= {toText(live[v.id]) || '—'}</span>}
          </div>
          {open === v.id && (
            <div className="var-edit">
              <label>
                Name
                <input className="field-input" value={v.name} onChange={(e) => updateVariable(v.id, { name: e.target.value })} />
              </label>
              <label>
                Kind
                <select
                  className="field-input"
                  value={v.type}
                  onChange={(e) => updateVariable(v.id, { type: e.target.value as Variable['type'] })}
                >
                  {Object.entries(TYPE_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Starting value
                <InitialEditor v={v} />
              </label>
              <button className="btn danger small" onClick={() => deleteVariable(v.id)}>
                Delete variable
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="add-row">
        {(['text', 'number', 'boolean', 'list'] as const).map((t) => (
          <button
            key={t}
            className="chip"
            onClick={() => {
              const id = addVariable(t);
              setOpen(id);
            }}
          >
            + {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ScreensPanel() {
  const screens = useProjectStore((s) => s.project.screens);
  const active = useProjectStore((s) => s.activeScreenId);
  const { setActiveScreen, addScreen, renameScreen, deleteScreen } = useProjectStore.getState();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="panel-section">
      <h3>Screens</h3>
      {screens.map((s, i) => (
        <div key={s.id} className={`screen-item ${s.id === active ? 'active' : ''}`} onClick={() => setActiveScreen(s.id)}>
          {editing === s.id ? (
            <input
              autoFocus
              className="field-input"
              value={s.name}
              onChange={(e) => renameScreen(s.id, e.target.value)}
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
            />
          ) : (
            <span className="screen-name" onDoubleClick={() => setEditing(s.id)} title="Double-click to rename">
              {i === 0 ? '🏠 ' : '📄 '}
              {s.name}
            </span>
          )}
          {screens.length > 1 && (
            <button
              className="icon-btn"
              title="Delete screen"
              onClick={(e) => {
                e.stopPropagation();
                deleteScreen(s.id);
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button className="chip" onClick={addScreen}>
        + Add screen
      </button>
      <p className="hint">The first screen 🏠 opens when the app starts.</p>
    </div>
  );
}
