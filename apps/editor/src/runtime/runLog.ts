import { create } from 'zustand';

/** One line of the run log: a block that ran, or an error. */
export interface LogEntry {
  id: number;
  nodeId: string;
  /** When it ran (ms since 1970). */
  time: number;
  kind: 'event' | 'block' | 'error';
  /** For events: what the event carried. For blocks: the inputs they read. By pin id. */
  values: Record<string, unknown>;
  /** For errors. */
  message?: string;
}

export interface RunLogState {
  entries: LogEntry[];
  /** How many older entries were dropped to keep the log short. */
  dropped: number;
}

/** The log keeps the newest entries only, so long loops don't slow the app down. */
export const MAX_LOG_ENTRIES = 500;
/** Entries are collected and shown together, at most this often. */
const FLUSH_MS = 50;

export const useRunLog = create<RunLogState>()(() => ({ entries: [], dropped: 0 }));

let working: LogEntry[] = [];
let dropped = 0;
let nextId = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Entries changed since the last flush (to copy them, so React sees the change). */
const changed = new Set<LogEntry>();

function flush() {
  timer = null;
  const copies = new Map<LogEntry, LogEntry>();
  for (const e of changed) copies.set(e, { ...e, values: { ...e.values } });
  changed.clear();
  // Unchanged entries keep their old copy, so their rows don't re-render.
  const prev = new Map(useRunLog.getState().entries.map((e) => [e.id, e]));
  useRunLog.setState({
    entries: working.map((e) => copies.get(e) ?? prev.get(e.id) ?? { ...e, values: { ...e.values } }),
    dropped,
  });
}

function schedule(entry: LogEntry) {
  changed.add(entry);
  timer ??= setTimeout(flush, FLUSH_MS);
}

function add(entry: Omit<LogEntry, 'id' | 'time'>) {
  const full: LogEntry = { ...entry, id: ++nextId, time: Date.now() };
  working.push(full);
  if (working.length > MAX_LOG_ENTRIES) {
    const extra = working.length - MAX_LOG_ENTRIES;
    working.splice(0, extra).forEach((e) => changed.delete(e));
    dropped += extra;
  }
  schedule(full);
}

/** A block (or event) started running. */
export function logStep(nodeId: string, payload?: Record<string, unknown>) {
  add({ nodeId, kind: payload ? 'event' : 'block', values: { ...payload } });
}

/** A running block read an input: added to its newest log line. */
export function logInput(nodeId: string, pinId: string, value: unknown) {
  for (let i = working.length - 1; i >= 0; i--) {
    const e = working[i];
    if (e.nodeId === nodeId && e.kind === 'block') {
      e.values[pinId] = value;
      schedule(e);
      return;
    }
  }
}

export function logError(nodeId: string, message: string) {
  add({ nodeId, kind: 'error', values: {}, message });
}

/** Empties the log (when the app starts again, or from the Clear button). */
export function clearRunLog() {
  if (timer) clearTimeout(timer);
  timer = null;
  working = [];
  dropped = 0;
  changed.clear();
  useRunLog.setState({ entries: [], dropped: 0 });
}
