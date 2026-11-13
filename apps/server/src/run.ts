// Runs one event block of a graph on the server and reports what happened.

import type { LogicGraph } from '@code-blocks/engine/graph';
import { Interpreter } from '@code-blocks/engine/interpreter';
import { createServerHost, type ServerVariable } from './host';
import type { KeyValueStore } from './store';

/** Longest a run may take, waits and web requests included. */
export const RUN_TIME_LIMIT_MS = 10_000;
/** Most steps kept in a run's log. */
export const MAX_STEPS_LOGGED = 500;
/** How long a run gets to wind down after its time is up. */
const STOP_GRACE_MS = 100;

export interface RunRequest {
  graph: LogicGraph;
  /** The event block to run. */
  nodeId: string;
  /** What the event carries, such as `{ value: 'Ada' }` for *When value changes*. */
  payload: Record<string, unknown>;
  variables: ServerVariable[];
  /** Keeps saved values apart per project. */
  projectId: string;
}

export interface RunStep {
  nodeId: string;
  /** For event blocks: what the event carried. */
  payload?: Record<string, unknown>;
  /** The inputs the block read, by pin id. */
  inputs: Record<string, unknown>;
}

export interface RunResult {
  ok: boolean;
  /** Set when a block stopped the run. */
  error?: { nodeId: string; message: string };
  /** The blocks that ran, in order (the newest MAX_STEPS_LOGGED). */
  steps: RunStep[];
  /** How many earlier steps were left out of `steps`. */
  dropped: number;
  /** Each variable's value when the run ended. */
  vars: Record<string, unknown>;
  /** Messages from *Show a message* blocks. */
  messages: string[];
}

export interface RunOptions {
  store: KeyValueStore;
  timeLimitMs?: number;
}

export async function runGraph(req: RunRequest, opts: RunOptions): Promise<RunResult> {
  const limit = opts.timeLimitMs ?? RUN_TIME_LIMIT_MS;
  const stoppedMessage = `The server stopped this run because it took longer than ${limit / 1000} seconds.`;
  const abort = new AbortController();
  const { host, vars, messages } = createServerHost({
    projectId: req.projectId,
    variables: req.variables,
    store: opts.store,
    signal: abort.signal,
    stoppedMessage,
  });

  const steps: RunStep[] = [];
  let dropped = 0;
  let error: RunResult['error'];
  let finished = false;
  const interpreter = new Interpreter(req.graph, host, {
    onNodeRun: (nodeId, payload) => {
      if (finished) return;
      steps.push(payload ? { nodeId, payload: { ...payload }, inputs: {} } : { nodeId, inputs: {} });
      if (steps.length > MAX_STEPS_LOGGED) {
        steps.shift();
        dropped++;
      }
    },
    onInput: (nodeId, pinId, value) => {
      if (finished) return;
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].nodeId === nodeId) {
          steps[i].inputs[pinId] = value;
          break;
        }
      }
    },
    onError: (err) => {
      if (!finished) error ??= { nodeId: err.nodeId, message: err.message };
    },
  });

  // Waits and web requests stop as soon as time is up. The race also covers
  // anything else still pending then.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<'timeUp'>((resolve) => {
    timer = setTimeout(() => {
      abort.abort();
      resolve('timeUp');
    }, limit);
  });
  const run = interpreter.runEvent(req.nodeId, req.payload);
  const outcome = await Promise.race([run, timeUp]);
  clearTimeout(timer);
  if (outcome === 'timeUp') {
    // Give the run a moment to stop at the block that was waiting, so the error points there.
    await Promise.race([run, new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS))]);
  }
  finished = true;
  abort.abort();
  if (outcome === 'timeUp') error ??= { nodeId: req.nodeId, message: stoppedMessage };

  return { ok: !error, ...(error ? { error } : {}), steps, dropped, vars, messages };
}
