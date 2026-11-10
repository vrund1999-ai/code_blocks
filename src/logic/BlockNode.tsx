import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, useMemo } from 'react';
import { CATEGORIES, getNodeDef } from '../engine/registry';
import type { NameLookup, Pin } from '../engine/types';
import { useProjectStore } from '../model/projectStore';
import { findInProject } from '../model/tree';
import { useRuntimeStore } from '../runtime/runtimeStore';
import { ConfigFieldInput, InlineValueInput } from '../app/fields';

export const TYPE_COLORS: Record<string, string> = {
  text: '#e64980',
  number: '#15aabf',
  boolean: '#fa5252',
  list: '#fab005',
  any: '#868e96',
};

export function useNameLookup(): NameLookup {
  const project = useProjectStore((s) => s.project);
  return useMemo(
    () => ({
      element: (id) => (typeof id === 'string' ? findInProject(project, id)?.el.name : undefined),
      variable: (id) => project.variables.find((v) => v.id === id)?.name,
      screen: (id) => project.screens.find((s) => s.id === id)?.name,
    }),
    [project],
  );
}

function PinHandle({ pin, side }: { pin: Pin; side: 'in' | 'out' }) {
  const isExec = pin.kind === 'exec';
  const color = isExec ? undefined : TYPE_COLORS[pin.valueType ?? 'any'];
  return (
    <Handle
      id={pin.id}
      type={side === 'in' ? 'target' : 'source'}
      position={side === 'in' ? Position.Left : Position.Right}
      className={isExec ? 'pin pin-exec' : 'pin pin-data'}
      style={color ? { background: color, borderColor: color } : undefined}
      title={isExec ? (side === 'in' ? 'Comes from' : 'Then') : `${pin.label} (${pin.valueType ?? 'any'})`}
    />
  );
}

function BlockNodeInner({ id, selected }: NodeProps) {
  const node = useProjectStore((s) => s.project.graph.nodes.find((n) => n.id === id));
  const edges = useProjectStore((s) => s.project.graph.edges);
  const updateNodeConfig = useProjectStore((s) => s.updateNodeConfig);
  const flashing = useRuntimeStore((s) => Boolean(s.flashing[id]));
  const error = useRuntimeStore((s) => (s.error?.nodeId === id ? s.error.message : null));
  const names = useNameLookup();

  const connectedIn = useMemo(
    () => new Set(edges.filter((e) => e.target === id).map((e) => e.targetPin)),
    [edges, id],
  );

  if (!node) return null;
  const def = getNodeDef(node.type);
  if (!def) return <div className="block unknown">Unknown block: {node.type}</div>;
  const cat = CATEGORIES.find((c) => c.id === def.category)!;
  const config = { ...Object.fromEntries(def.configFields.map((f) => [f.key, f.default])), ...node.config };
  const problem = def.validate?.(config);

  const execIns = def.inputs.filter((p) => p.kind === 'exec');
  const execOuts = def.outputs.filter((p) => p.kind === 'exec');
  const dataIns = def.inputs.filter((p) => p.kind === 'data');
  const dataOuts = def.outputs.filter((p) => p.kind === 'data');
  // Config fields that are shown in the sentence/fields area (pin defaults are inline).
  const fields = def.configFields;

  return (
    <div
      className={[
        'block',
        `cat-${def.category}`,
        selected && 'selected',
        flashing && 'flash',
        error && 'has-error',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ['--cat' as string]: cat.color }}
      data-node-type={node.type}
    >
      <div className="block-header">
        {execIns.map((p) => (
          <PinHandle key={p.id} pin={p} side="in" />
        ))}
        <span className="block-title">{def.label}</span>
        {execOuts.length === 1 && execOuts[0].id === 'next' && <PinHandle pin={execOuts[0]} side="out" />}
      </div>
      {def.sentence && <div className="block-sentence">{def.sentence(config, names)}</div>}

      {fields.length > 0 && (
        <div className="block-fields">
          {fields.map((f) => (
            <label key={f.key} className="block-field">
              <span>{f.label}</span>
              <ConfigFieldInput
                compact
                field={f}
                value={config[f.key]}
                onChange={(v) => updateNodeConfig(id, { [f.key]: v })}
              />
            </label>
          ))}
        </div>
      )}

      {/* Named exec outputs (If / Repeat / For each) */}
      {!(execOuts.length === 1 && execOuts[0].id === 'next') &&
        execOuts.map((p) => (
          <div key={p.id} className="pin-row out exec">
            <span className="pin-label">{p.label} ▸</span>
            <PinHandle pin={p} side="out" />
          </div>
        ))}

      {dataIns.map((p) => (
        <div key={p.id} className="pin-row in">
          <PinHandle pin={p} side="in" />
          <span className="pin-label">{p.label}</span>
          {p.inline && !connectedIn.has(p.id) && (
            <InlineValueInput
              type={p.inline.type}
              value={config[p.id] ?? p.inline.default}
              onChange={(v) => updateNodeConfig(id, { [p.id]: v })}
            />
          )}
        </div>
      ))}

      {dataOuts.map((p) => (
        <div key={p.id} className="pin-row out">
          <span className="pin-label">{p.label}</span>
          <PinHandle pin={p} side="out" />
        </div>
      ))}

      {(error || problem) && <div className="block-problem">⚠ {error ?? problem}</div>}
    </div>
  );
}

export const BlockNode = memo(BlockNodeInner);
