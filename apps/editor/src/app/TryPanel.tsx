// The *Try it* section of the inspector for server event blocks: runs the
// workflow as it is now, once, on the server, with sample data, without
// deploying it. The blocks that ran go to the Run log.

import { create } from 'zustand';
import { hookMethod } from '@code-blocks/engine/nodes/server';
import { OfflineError } from '../data/api';
import { EMPTY_SAMPLE, samplePayload, tryWorkflow, type TryResult, type TrySample } from '../data/tryApi';
import { useProjectStore } from '../model/projectStore';
import { showRunSteps } from '../runtime/runLog';
import { useRuntimeStore } from '../runtime/runtimeStore';

interface TryState {
  /** Sample data per block, kept while the editor is open. */
  samples: Record<string, TrySample>;
  /** The latest try of each block. */
  results: Record<string, { result?: TryResult; problem?: string; busy?: boolean }>;
}

export const useTryStore = create<TryState>()(() => ({ samples: {}, results: {} }));

const setResult = (nodeId: string, r: TryState['results'][string]) =>
  useTryStore.setState((s) => ({ results: { ...s.results, [nodeId]: r } }));

async function runTry(nodeId: string, type: string, config: Record<string, unknown>) {
  const sample = useTryStore.getState().samples[nodeId] ?? EMPTY_SAMPLE;
  const payload = samplePayload(type, config, sample);
  if (typeof payload === 'string') return setResult(nodeId, { problem: payload });
  setResult(nodeId, { busy: true });
  try {
    const result = await tryWorkflow(useProjectStore.getState().project, nodeId, payload);
    setResult(nodeId, { result });
    // While the app runs, the Run log belongs to it.
    if (!useRuntimeStore.getState().running) showRunSteps(result.steps, result.dropped, result.error);
  } catch (err) {
    setResult(nodeId, {
      problem: err instanceof OfflineError ? err.message : `The server couldn’t try it: ${(err as Error).message}`,
    });
  }
}

function showBlock(nodeId: string) {
  useProjectStore.getState().select({ kind: 'node', id: nodeId });
}

const shown = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

function Outcome({ result }: { result: TryResult }) {
  const steps = result.steps.length + result.dropped;
  return (
    <div className={`try-result ${result.ok ? 'ok' : 'failed'}`} role="status" aria-label="Try result">
      {result.ok ? (
        <div className="try-line">
          ✓ Finished in {steps === 1 ? '1 step' : `${steps} steps`}. They’re listed in the Run log.
        </div>
      ) : (
        <div className="try-line field-problem">
          ⚠ {result.error?.message}{' '}
          {result.error && (
            <button className="link-btn" onClick={() => showBlock(result.error!.nodeId)}>
              show me
            </button>
          )}
        </div>
      )}
      {result.reply ? (
        <>
          <div className="prop-label">Reply {result.reply.status}</div>
          <pre className="try-reply" aria-label="Reply">
            {result.reply.value === '' || result.reply.value == null ? '(nothing)' : shown(result.reply.value)}
          </pre>
        </>
      ) : (
        result.ok && <div className="hint">No “Reply” block ran.</div>
      )}
      {result.messages.map((m, i) => (
        <div key={i} className="hint">
          💬 {m}
        </div>
      ))}
    </div>
  );
}

export function TryPanel({ nodeId, type, config }: { nodeId: string; type: string; config: Record<string, unknown> }) {
  const sample = useTryStore((s) => s.samples[nodeId] ?? EMPTY_SAMPLE);
  const state = useTryStore((s) => s.results[nodeId]);
  const set = (patch: Partial<TrySample>) =>
    useTryStore.setState((s) => ({ samples: { ...s.samples, [nodeId]: { ...sample, ...patch } } }));
  const method = hookMethod(config);

  return (
    <section className="try-panel" aria-label="Try it">
      <div className="menu-title">Try it</div>
      <p className="hint">
        Runs this workflow once on the server, as it is now, without deploying it. It uses the real tables and saved
        values, so rows it adds are really added.
      </p>
      {type === 'server.http' && (
        <>
          <label className="prop-row">
            <div className="prop-label">Address values</div>
            <textarea
              className="field-input"
              rows={2}
              placeholder="name: Ada"
              value={sample.query}
              onChange={(e) => set({ query: e.target.value })}
            />
          </label>
          {method !== 'GET' && (
            <label className="prop-row">
              <div className="prop-label">Data sent</div>
              <textarea
                className="field-input"
                rows={3}
                placeholder={'{ "item": "tea" }'}
                value={sample.body}
                onChange={(e) => set({ body: e.target.value })}
              />
              <div className="hint">Text, or JSON for a record or a list.</div>
            </label>
          )}
        </>
      )}
      {type === 'server.form' && (
        <label className="prop-row">
          <div className="prop-label">Values sent</div>
          <textarea
            className="field-input"
            rows={3}
            placeholder={'name: Ada\nemail: ada@example.com'}
            value={sample.values}
            onChange={(e) => set({ values: e.target.value })}
          />
          <div className="hint">One value per line, as a name and a value.</div>
        </label>
      )}
      <button className="btn run" disabled={state?.busy} onClick={() => void runTry(nodeId, type, config)}>
        {state?.busy ? 'Trying…' : type === 'server.schedule' ? '▶ Run now' : '▶ Try it'}
      </button>
      {state?.problem && (
        <div className="field-problem" role="alert">
          ⚠ {state.problem}
        </div>
      )}
      {state?.result && <Outcome result={state.result} />}
    </section>
  );
}
