import { useReactFlow } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import { defaultConfig, findPin, getNodeDef, inputPins } from '../engine/registry';
import { previewValue } from '../engine/preview';
import type { NameLookup } from '../engine/types';
import { useProjectStore } from '../model/projectStore';
import type { GraphNode } from '../model/types';
import { clearRunLog, useRunLog, type LogEntry } from '../runtime/runLog';
import { useRuntimeStore } from '../runtime/runtimeStore';
import { useNameLookup } from './BlockNode';

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** What a log line says about its block, and labels for its values. */
function describe(entry: LogEntry, node: GraphNode | undefined, names: NameLookup) {
  const def = node && getNodeDef(node.type);
  if (!node || !def) return { title: 'A block that has since been deleted', values: [] as [string, unknown][] };
  const config = { ...defaultConfig(def), ...node.config };
  const title = def.sentence?.(config, names) ?? def.label;
  const values = Object.entries(entry.values).map(([pinId, value]): [string, unknown] => {
    const pin = entry.kind === 'event' ? findPin(def, 'out', pinId) : inputPins(def, config).find((p) => p.id === pinId);
    return [pin?.label ?? pinId, value];
  });
  return { title, values };
}

const LogRow = memo(function LogRow({
  entry,
  node,
  names,
  onPick,
}: {
  entry: LogEntry;
  node: GraphNode | undefined;
  names: NameLookup;
  onPick: (nodeId: string) => void;
}) {
  const { title, values } = describe(entry, node, names);
  return (
    <li
      className={`log-row log-${entry.kind}`}
      title={node ? 'Click to show this block' : undefined}
      onClick={() => node && onPick(entry.nodeId)}
    >
      <div className="log-line">
        {entry.kind === 'event' && <span className="log-time">{time(entry.time)}</span>}
        <span className="log-title">
          {entry.kind === 'error' ? `⚠ ${entry.message}` : `${entry.kind === 'event' ? '▶ ' : ''}${title}`}
        </span>
      </div>
      {values.length > 0 && (
        <div className="log-values">
          {values.map(([label, value]) => {
            const shown = previewValue(value);
            return (
              <span key={label} className="log-value" title={shown.full}>
                {label}: <b>{shown.short}</b>
              </span>
            );
          })}
        </div>
      )}
    </li>
  );
});

/**
 * Lists every block that ran, newest last, with the values it used. Each
 * event (a click, a typed value…) starts a group. Click a line to show its
 * block. The log of the last run stays after Stop.
 */
export function RunLog() {
  const { entries, dropped } = useRunLog();
  const running = useRuntimeStore((s) => s.running);
  const nodes = useProjectStore((s) => s.project.graph.nodes);
  const names = useNameLookup();
  const select = useProjectStore((s) => s.select);
  const rf = useReactFlow();
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  // Keep the newest line in view, unless the user scrolled up to read.
  useEffect(() => {
    const list = listRef.current;
    if (list && stick.current) list.scrollTop = list.scrollHeight;
  }, [entries, open]);

  const pick = (nodeId: string) => {
    select({ kind: 'node', id: nodeId });
    rf.fitView({ nodes: [{ id: nodeId }], duration: 300, maxZoom: 1 });
  };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const steps = entries.filter((e) => e.kind !== 'error').length + dropped;

  return (
    <section className={`run-log ${open ? 'open' : ''}`} aria-label="Run log">
      <div className="run-log-head">
        <button className="run-log-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} Run log
          {steps > 0 && <span className="run-log-count">{steps === 1 ? '1 step' : `${steps} steps`}</span>}
        </button>
        {entries.length > 0 && (
          <button className="link-btn" onClick={clearRunLog}>
            Clear
          </button>
        )}
      </div>
      {open && (
        <ol
          ref={listRef}
          className="run-log-list"
          onScroll={(e) => {
            const l = e.currentTarget;
            stick.current = l.scrollHeight - l.scrollTop - l.clientHeight < 24;
          }}
        >
          {dropped > 0 && <li className="log-dropped">{dropped} earlier steps aren’t shown.</li>}
          {entries.length === 0 && (
            <li className="log-empty">
              {running
                ? 'Use your app: each block that runs is listed here.'
                : 'Press ▶ Run and use your app. Each block that runs is listed here, with the values it used.'}
            </li>
          )}
          {entries.map((e) => (
            <LogRow key={e.id} entry={e} node={byId.get(e.nodeId)} names={names} onPick={pick} />
          ))}
        </ol>
      )}
    </section>
  );
}
