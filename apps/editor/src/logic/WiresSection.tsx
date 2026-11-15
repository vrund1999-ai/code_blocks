import { useMemo } from 'react';
import { useProjectStore } from '../model/projectStore';
import { pinWires, wireBetween } from '../model/wiring';

/**
 * A block's wires as a list, so they can be made and removed without a mouse:
 * each pin shows what it is wired to, and offers the pins on other blocks that fit.
 */
export function WiresSection({ nodeId }: { nodeId: string }) {
  const project = useProjectStore((s) => s.project);
  const pins = useMemo(() => pinWires(project, nodeId), [project, nodeId]);
  if (pins.length === 0) return null;
  const { addEdge, deleteEdges } = useProjectStore.getState();

  return (
    <section className="wires" aria-label="Wires">
      <h3>Wires</h3>
      <p className="hint">The same as dragging between the dots on the blocks.</p>
      {pins.map((p) => (
        <div className="wire-pin" key={`${p.side}:${p.pin.id}`} role="group" aria-label={p.label}>
          <div className="wire-pin-name">
            <span aria-hidden="true">{p.side === 'in' ? '◂ ' : ''}</span>
            {p.label}
            <span aria-hidden="true">{p.side === 'out' ? ' ▸' : ''}</span>
          </div>
          {p.wires.length > 0 && (
            <ul>
              {p.wires.map((w) => (
                <li key={w.edgeId}>
                  <span className="wire-end">{w.label}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Disconnect from ${w.label}`}
                    title="Disconnect"
                    onClick={() => deleteEdges([w.edgeId])}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {p.choices.length > 0 && (
            <select
              className="field-input"
              aria-label={`New wire for “${p.label}”`}
              value=""
              onChange={(e) => {
                const to = p.choices[Number(e.target.value)];
                if (to) addEdge(wireBetween(nodeId, p, to));
              }}
            >
              <option value="">{p.side === 'in' ? 'Connect from…' : 'Connect to…'}</option>
              {p.choices.map((c, i) => (
                <option key={`${c.nodeId}:${c.pinId}`} value={i}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </section>
  );
}
