import { useReactFlow } from '@xyflow/react';
import { useState } from 'react';
import { CATEGORIES, nodesInCategory } from '@code-blocks/engine/registry';
import { useProjectStore } from '../model/projectStore';
import { NODE_DRAG_MIME } from './LogicCanvas';

export function NodePalette() {
  const rf = useReactFlow();
  const addNode = useProjectStore((s) => s.addNode);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const addAtCenter = (type: string) => {
    const rect = document.querySelector('.logic-canvas')?.getBoundingClientRect();
    if (!rect) return;
    const pos = rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const jitter = () => Math.round((Math.random() - 0.5) * 60);
    addNode(type, { x: pos.x - 110 + jitter(), y: pos.y - 60 + jitter() });
  };

  return (
    <div className="panel-section node-palette">
      <h3>Blocks</h3>
      <input className="field-input search" placeholder="Search blocks…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {CATEGORIES.map((cat) => {
        const defs = nodesInCategory(cat.id).filter(
          (d) => !q || d.label.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
        );
        if (!defs.length) return null;
        return (
          <div key={cat.id} className="node-cat">
            <div className="node-cat-title" style={{ color: cat.color }}>
              {cat.label} <span className="hint">{cat.hint}</span>
            </div>
            {defs.map((d) => (
              <button
                key={d.type}
                className="node-item"
                style={{ ['--cat' as string]: cat.color }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(NODE_DRAG_MIME, d.type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => addAtCenter(d.type)}
                title={`${d.description}\nDrag onto the canvas, or click to add.`}
              >
                {d.label}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
