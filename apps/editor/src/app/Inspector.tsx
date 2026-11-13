import { useReactFlow } from '@xyflow/react';
import { CATEGORIES, getNodeDef, inputPins } from '../engine/registry';
import { ELEMENT_DEFS, type PropField } from '../model/elements';
import { useProjectStore } from '../model/projectStore';
import { useMemo } from 'react';
import { isRecord, toList } from '../engine/convert';
import { recordFields } from '../engine/nodes/records';
import { enclosingListInProject, findInProject } from '../model/tree';
import type { ElementType, Project, PropValue, UIElement, ValueType } from '../model/types';
import { ConfigFieldInput, InlineValueInput } from './fields';

const EVENT_FOR: Partial<Record<ElementType, { type: string; label: string }>> = {
  button: { type: 'event.click', label: 'When clicked…' },
  input: { type: 'event.inputChange', label: 'When typed in…' },
  checkbox: { type: 'event.inputChange', label: 'When ticked…' },
  dropdown: { type: 'event.inputChange', label: 'When a choice is picked…' },
  list: { type: 'event.listDelete', label: 'When item deleted…' },
};

function compatible(bindable: ValueType, varType: ValueType) {
  return bindable === varType || bindable === 'text';
}

/** Field names used anywhere in the project, to suggest for a card's item fields. */
function knownFieldNames(project: Project): string[] {
  const names = new Set<string>();
  const addKeys = (v: unknown) => {
    for (const x of [v, ...toList(v)]) if (isRecord(x)) Object.keys(x).forEach((k) => names.add(k));
  };
  for (const v of project.variables) addKeys(v.initial);
  for (const n of project.graph.nodes) {
    if (n.type === 'data.makeRecord') recordFields(n.config).forEach((f) => f.name.trim() && names.add(f.name.trim()));
    if (n.type === 'data.getField' || n.type === 'data.setField') {
      if (typeof n.config.field === 'string' && n.config.field.trim()) names.add(n.config.field.trim());
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

const ITEM = '__item';

function PropEditor({ el, field }: { el: UIElement; field: PropField }) {
  const project = useProjectStore((s) => s.project);
  const variables = project.variables;
  const setElementProp = useProjectStore((s) => s.setElementProp);
  const pv: PropValue = el.props[field.key] ?? { kind: 'static', value: ELEMENT_DEFS[el.type].defaults[field.key] };
  const set = (v: PropValue) => setElementProp(el.id, field.key, v);
  const bindOptions = field.bindable ? variables.filter((v) => compatible(field.bindable!, v.type)) : [];
  // Inside a List's card, a setting can also show a field of the card's item.
  const inCard = useMemo(() => enclosingListInProject(project, el.id) !== null, [project, el.id]);
  const fieldNames = useMemo(() => (inCard ? knownFieldNames(project) : []), [inCard, project]);
  const bound = pv.kind === 'variable' || pv.kind === 'item';
  // A list's items only make sense bound to a variable.
  const bindOnly = Boolean(field.bindOnly);
  const canBind = bindOptions.length > 0 || inCard;
  const unbound: PropValue = { kind: 'static', value: ELEMENT_DEFS[el.type].defaults[field.key] };
  const firstBinding: PropValue = inCard
    ? { kind: 'item', field: fieldNames[0] ?? '' }
    : bindOptions[0]
      ? { kind: 'variable', variableId: bindOptions[0].id }
      : pv;

  let editor: React.ReactNode;
  if (bound || bindOnly) {
    const listId = `fields-${el.id}-${field.key}`;
    editor = (
      <>
        <select
          className="field-input bound"
          aria-label={`${field.label}: linked to`}
          value={pv.kind === 'variable' ? pv.variableId : pv.kind === 'item' ? ITEM : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === ITEM) set({ kind: 'item', field: pv.kind === 'item' ? pv.field : (fieldNames[0] ?? '') });
            else set(v ? { kind: 'variable', variableId: v } : unbound);
          }}
        >
          <option value="">
            {canBind ? 'Pick a variable…' : bindOnly ? '(create a list variable first)' : '(create a variable first)'}
          </option>
          {inCard && <option value={ITEM}>📋 A field of this card’s item</option>}
          {bindOptions.map((v) => (
            <option key={v.id} value={v.id}>
              🔗 {v.name}
            </option>
          ))}
        </select>
        {pv.kind === 'item' && (
          <>
            <input
              className="field-input"
              aria-label={`${field.label}: item field`}
              placeholder="field name, e.g. name"
              list={listId}
              value={pv.field}
              onChange={(e) => set({ kind: 'item', field: e.target.value })}
            />
            <datalist id={listId}>
              {fieldNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <div className="hint">Each card shows this field of its item. Leave it empty to show the whole item.</div>
          </>
        )}
      </>
    );
  } else if (pv.kind === 'static') {
    const value = pv.value;
    switch (field.type) {
      case 'boolean':
        editor = <input type="checkbox" checked={Boolean(value)} onChange={(e) => set({ kind: 'static', value: e.target.checked })} />;
        break;
      case 'number':
        editor = field.optional ? (
          // Can be left empty, meaning automatic. No negative sizes.
          <input
            type="number"
            min={0}
            className="field-input"
            aria-label={field.label}
            placeholder={field.placeholder}
            value={value === '' || value === undefined || value === null ? '' : String(value)}
            onChange={(e) =>
              set({ kind: 'static', value: e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0) })
            }
          />
        ) : (
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
          <textarea
            className="field-input"
            // Grows with its lines (up to 6), so a dropdown's choices all show.
            rows={Math.min(6, Math.max(2, String(value ?? '').split('\n').length))}
            value={String(value ?? '')} onChange={(e) => set({ kind: 'static', value: e.target.value })} />
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
            onClick={() => set(bound ? unbound : firstBinding)}
            disabled={!bound && !canBind}
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
  const { renameElement, deleteElement, addNode, setTab, duplicateSelection } = useProjectStore.getState();
  const def = ELEMENT_DEFS[el.type];
  const event = EVENT_FOR[el.type];
  const fields = def.fields.filter((f) => !(isRoot && f.notOnRoot));
  const styleFields = fields.filter((f) => f.group === 'style');
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
      {fields
        .filter((f) => !f.group)
        .map((f) => (
          <PropEditor key={f.key} el={el} field={f} />
        ))}
      {styleFields.length > 0 && (
        <section className="style-section" aria-label="Style">
          <h4>Style</h4>
          <div className="style-grid">
            {styleFields
              .filter((f) => f.type === 'number')
              .map((f) => (
                <PropEditor key={f.key} el={el} field={f} />
              ))}
          </div>
          {styleFields
            .filter((f) => f.type !== 'number')
            .map((f) => (
              <PropEditor key={f.key} el={el} field={f} />
            ))}
          <div className="hint">
            {isRoot ? 'The font is used by everything on this screen.' : 'Sizes are in pixels. Leave a box empty for the usual size.'}
          </div>
        </section>
      )}
      <div className="inspector-actions">
        {event && (
          <button className="btn primary" onClick={addLogic}>
            ⚡ {event.label}
          </button>
        )}
        {!isRoot && (
          <button className="btn" onClick={duplicateSelection} title="Copy: Ctrl+C · Paste: Ctrl+V · Duplicate: Ctrl+D">
            Duplicate
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
  const { updateNodeConfig, deleteNodes, duplicateSelection } = useProjectStore.getState();
  const many = useProjectStore((s) => (s.selection?.kind === 'node' ? (s.selection.ids?.length ?? 1) : 1));
  if (!node) return null;
  const def = getNodeDef(node.type);
  if (!def) return <p>Unknown block.</p>;
  const cat = CATEGORIES.find((c) => c.id === def.category)!;
  const config = { ...Object.fromEntries(def.configFields.map((f) => [f.key, f.default])), ...node.config };
  const inlinePins = inputPins(def, config).filter((p) => p.inline && !edges.some((e) => e.target === nodeId && e.targetPin === p.id));

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
        <button className="btn" onClick={duplicateSelection} title="Copy: Ctrl+C · Paste: Ctrl+V · Duplicate: Ctrl+D">
          {many > 1 ? `Duplicate ${many} blocks` : 'Duplicate'}
        </button>
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
