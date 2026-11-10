import { useReactFlow } from '@xyflow/react';
import { CATEGORIES, getNodeDef } from '../engine/registry';
import { ELEMENT_DEFS, type PropField } from '../model/elements';
import { useProjectStore } from '../model/projectStore';
import { findInProject } from '../model/tree';
import type { ElementType, PropValue, UIElement, ValueType } from '../model/types';
import { ConfigFieldInput, InlineValueInput } from './fields';

const EVENT_FOR: Partial<Record<ElementType, { type: string; label: string }>> = {
  button: { type: 'event.click', label: 'When clicked…' },
  input: { type: 'event.inputChange', label: 'When typed in…' },
  checkbox: { type: 'event.inputChange', label: 'When ticked…' },
  list: { type: 'event.listDelete', label: 'When item deleted…' },
};

function compatible(bindable: ValueType, varType: ValueType) {
  return bindable === varType || bindable === 'text';
}

function PropEditor({ el, field }: { el: UIElement; field: PropField }) {
  const variables = useProjectStore((s) => s.project.variables);
  const setElementProp = useProjectStore((s) => s.setElementProp);
  const pv: PropValue = el.props[field.key] ?? { kind: 'static', value: ELEMENT_DEFS[el.type].defaults[field.key] };
  const set = (v: PropValue) => setElementProp(el.id, field.key, v);
  const bindOptions = field.bindable ? variables.filter((v) => compatible(field.bindable!, v.type)) : [];
  const bound = pv.kind === 'variable';
  // A list's items only make sense bound to a variable.
  const bindOnly = field.bindable === 'list';

  let editor: React.ReactNode;
  if (bound || bindOnly) {
    editor = (
      <select
        className="field-input bound"
        value={pv.kind === 'variable' ? pv.variableId : ''}
        onChange={(e) =>
          set(
            e.target.value
              ? { kind: 'variable', variableId: e.target.value }
              : { kind: 'static', value: ELEMENT_DEFS[el.type].defaults[field.key] },
          )
        }
      >
        <option value="">{bindOptions.length ? 'Pick a variable…' : '(create a list variable first)'}</option>
        {bindOptions.map((v) => (
          <option key={v.id} value={v.id}>
            🔗 {v.name}
          </option>
        ))}
      </select>
    );
  } else {
    const value = pv.value;
    switch (field.type) {
      case 'boolean':
        editor = <input type="checkbox" checked={Boolean(value)} onChange={(e) => set({ kind: 'static', value: e.target.checked })} />;
        break;
      case 'number':
        editor = (
          <input
            type="number"
            className="field-input"
            value={String(value ?? 0)}
            onChange={(e) => set({ kind: 'static', value: Number(e.target.value) })}
          />
        );
        break;
      case 'select':
        editor = (
          <select className="field-input" value={String(value)} onChange={(e) => set({ kind: 'static', value: e.target.value })}>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
        break;
      case 'color':
        editor = (
          <input type="color" className="color-input" value={String(value || '#ffffff')} onChange={(e) => set({ kind: 'static', value: e.target.value })} />
        );
        break;
      case 'textarea':
        editor = (
          <textarea className="field-input" rows={2} value={String(value ?? '')} onChange={(e) => set({ kind: 'static', value: e.target.value })} />
        );
        break;
      default:
        editor = (
          <input className="field-input" value={String(value ?? '')} onChange={(e) => set({ kind: 'static', value: e.target.value })} />
        );
    }
  }

  return (
    <div className="prop-row">
      <div className="prop-label">
        <span>{field.label}</span>
        {field.bindable && !bindOnly && (
          <button
            className={`bind-toggle ${bound ? 'on' : ''}`}
            title={bound ? 'Stop using a variable' : 'Use a variable for this (it updates when the variable changes)'}
            onClick={() =>
              set(
                bound
                  ? { kind: 'static', value: ELEMENT_DEFS[el.type].defaults[field.key] }
                  : bindOptions[0]
                    ? { kind: 'variable', variableId: bindOptions[0].id }
                    : pv,
              )
            }
            disabled={!bound && bindOptions.length === 0}
          >
            🔗 {bound ? 'linked' : 'link'}
          </button>
        )}
      </div>
      {editor}
      {field.help && <div className="hint">{field.help}</div>}
    </div>
  );
}

function ElementInspector({ el, isRoot }: { el: UIElement; isRoot: boolean }) {
  const { renameElement, deleteElement, addNode, setTab } = useProjectStore.getState();
  const def = ELEMENT_DEFS[el.type];
  const event = EVENT_FOR[el.type];
  const rf = useReactFlow();

  const addLogic = () => {
    if (!event) return;
    const nodes = useProjectStore.getState().project.graph.nodes;
    const y = nodes.length ? Math.max(...nodes.map((n) => n.position.y)) + 220 : 40;
    const id = addNode(event.type, { x: 40, y }, { element: el.id });
    setTab('logic');
    setTimeout(() => rf.fitView({ nodes: [{ id }], duration: 300, maxZoom: 1 }), 50);
  };

  return (
    <>
      <div className="inspector-head">
        <span className="icon">{def.icon}</span>
        <div>
          <div className="title">{isRoot ? 'Screen background' : def.label}</div>
          <div className="hint">{def.description}</div>
        </div>
      </div>
      {!isRoot && (
        <div className="prop-row">
          <div className="prop-label">Name</div>
          <input className="field-input" value={el.name} onChange={(e) => renameElement(el.id, e.target.value)} />
          <div className="hint">Used to pick this element in logic blocks.</div>
        </div>
      )}
      {def.fields
        .filter((f) => !(isRoot && f.key === 'visible'))
        .map((f) => (
          <PropEditor key={f.key} el={el} field={f} />
        ))}
      <div className="inspector-actions">
        {event && (
          <button className="btn primary" onClick={addLogic}>
            ⚡ {event.label}
          </button>
        )}
        {!isRoot && (
          <button className="btn danger" onClick={() => deleteElement(el.id)}>
            Delete
          </button>
        )}
      </div>
    </>
  );
}

function NodeInspector({ nodeId }: { nodeId: string }) {
  const node = useProjectStore((s) => s.project.graph.nodes.find((n) => n.id === nodeId));
  const edges = useProjectStore((s) => s.project.graph.edges);
  const { updateNodeConfig, deleteNodes } = useProjectStore.getState();
  if (!node) return null;
  const def = getNodeDef(node.type);
  if (!def) return <p>Unknown block.</p>;
  const cat = CATEGORIES.find((c) => c.id === def.category)!;
  const config = { ...Object.fromEntries(def.configFields.map((f) => [f.key, f.default])), ...node.config };
  const inlinePins = def.inputs.filter((p) => p.inline && !edges.some((e) => e.target === nodeId && e.targetPin === p.id));

  return (
    <>
      <div className="inspector-head">
        <span className="cat-dot" style={{ background: cat.color }} />
        <div>
          <div className="title">{def.label}</div>
          <div className="hint">{def.description}</div>
        </div>
      </div>
      {def.configFields.map((f) => (
        <div className="prop-row" key={f.key}>
          <div className="prop-label">{f.label}</div>
          <ConfigFieldInput field={f} value={config[f.key]} onChange={(v) => updateNodeConfig(nodeId, { [f.key]: v })} />
        </div>
      ))}
      {inlinePins.map((p) => (
        <div className="prop-row" key={p.id}>
          <div className="prop-label">{p.label}</div>
          <InlineValueInput
            type={p.inline!.type}
            value={config[p.id] ?? p.inline!.default}
            onChange={(v) => updateNodeConfig(nodeId, { [p.id]: v })}
          />
          <div className="hint">Or connect a value block into “{p.label}”.</div>
        </div>
      ))}
      <div className="inspector-actions">
        <button className="btn danger" onClick={() => deleteNodes([nodeId])}>
          Delete block
        </button>
      </div>
    </>
  );
}

export function Inspector() {
  const selection = useProjectStore((s) => s.selection);
  const project = useProjectStore((s) => s.project);
  const tab = useProjectStore((s) => s.tab);

  let body: React.ReactNode;
  if (selection?.kind === 'element') {
    const found = findInProject(project, selection.id);
    body = found ? <ElementInspector el={found.el} isRoot={found.screen.root.id === found.el.id} /> : null;
  } else if (selection?.kind === 'node') {
    body = <NodeInspector nodeId={selection.id} />;
  }

  return (
    <aside className="inspector">
      <h3>Settings</h3>
      {body ?? (
        <div className="hint empty-inspector">
          {tab === 'design'
            ? 'Click an element on the screen to change how it looks.'
            : 'Click a block to see what it does and change its settings.'}
        </div>
      )}
    </aside>
  );
}
