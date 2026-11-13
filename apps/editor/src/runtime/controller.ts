// Connects the pure engine to the browser: runtime state, timers, storage.

import { coerceTo, toBool, toNumber, toText } from '@code-blocks/engine/convert';
import { Interpreter } from '@code-blocks/engine/interpreter';
import type { StoredRow } from '@code-blocks/engine/tables';
import { HostError, type GraphError, type HostApi, type TablesApi } from '@code-blocks/engine/types';
import { addRow, ApiError, deleteRow, listRows, updateRow } from '../data/rowsApi';
import { fetchViaServer, sendForm } from '../data/serverApi';
import { appStoragePrefix } from '../model/persistence';
import { useProjectStore } from '../model/projectStore';
import { findInProject } from '../model/tree';
import { clearRunLog, logError, logInput, logStep } from './runLog';
import { initialRuntime, pushToast, setElementState, useRuntimeStore } from './runtimeStore';

/** A *Fetch from API* request that takes longer than this counts as failed. */
const FETCH_TIMEOUT_MS = 30_000;

let generation = 0;
let timers: ReturnType<typeof setInterval>[] = [];
let host: HostApi | null = null;

const project = () => useProjectStore.getState().project;

function flash(nodeId: string) {
  const rt = useRuntimeStore.getState();
  if (rt.flashing[nodeId]) return;
  useRuntimeStore.setState((s) => ({ flashing: { ...s.flashing, [nodeId]: true } }));
  setTimeout(() => {
    useRuntimeStore.setState((s) => {
      const next = { ...s.flashing };
      delete next[nodeId];
      return { flashing: next };
    });
  }, 600);
}

// Wire values are collected and stored together, at most every WIRE_FLUSH_MS,
// so a loop reading thousands of values doesn't re-render for each one.
const WIRE_FLUSH_MS = 50;
let pendingWires = new Map<string, unknown>();
let wireTimer: ReturnType<typeof setTimeout> | null = null;

function flushWires() {
  wireTimer = null;
  if (!pendingWires.size) return;
  const batch = pendingWires;
  pendingWires = new Map();
  useRuntimeStore.setState((s) => {
    const wires = { ...s.wires };
    for (const [id, value] of batch) wires[id] = { value, n: (wires[id]?.n ?? 0) + 1 };
    return { wires };
  });
}

function wireValue(gen: number, edgeId: string, value: unknown) {
  if (gen !== generation) return;
  // Blocks never change a list or record in place (they copy it first), so no copy is needed here.
  pendingWires.set(edgeId, value);
  wireTimer ??= setTimeout(flushWires, WIRE_FLUSH_MS);
}

function clearWires() {
  if (wireTimer) clearTimeout(wireTimer);
  wireTimer = null;
  pendingWires = new Map();
}

function onError(err: GraphError) {
  useRuntimeStore.setState({ error: { nodeId: err.nodeId, message: err.message } });
  pushToast(err.message, 'error', 5000);
}

/**
 * Table rows, through the server. Writes after Stop are refused, and server
 * problems show as the block's error.
 */
function makeTables(alive: () => boolean): TablesApi {
  const projectId = () => project().id;
  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (!alive()) throw new HostError('The app was stopped.');
    try {
      return await fn();
    } catch (err) {
      throw new HostError((err as Error).message);
    }
  };
  return {
    table: (id) => project().tables.find((t) => t.id === id),
    rows: (tableId) =>
      call(async () => {
        const all: StoredRow[] = [];
        for (;;) {
          const page = await listRows(projectId(), tableId, all.length, RUN_PAGE_SIZE);
          all.push(...page.rows);
          if (page.rows.length === 0 || all.length >= page.total) return all;
        }
      }),
    add: (tableId, values) => call(() => addRow(projectId(), tableId, values)),
    update: (tableId, rowId, values) =>
      call(async () => {
        try {
          return await updateRow(projectId(), tableId, rowId, values);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }
      }),
    remove: (tableId, rowId) =>
      call(async () => {
        try {
          await deleteRow(projectId(), tableId, rowId);
          return true;
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) return false;
          throw err;
        }
      }),
  };
}

/** Rows loaded per request when a block reads a whole table. */
const RUN_PAGE_SIZE = 500;

function makeHost(gen: number): HostApi {
  const alive = () => gen === generation;
  const prefix = appStoragePrefix(project().id);
  return {
    getVar: (id) => useRuntimeStore.getState().vars[id],
    setVar: (id, value) => {
      if (!alive()) return;
      const v = project().variables.find((x) => x.id === id);
      useRuntimeStore.setState((s) => ({ vars: { ...s.vars, [id]: coerceTo(v?.type, value) } }));
    },
    getElementValue: (id) => {
      const el = findInProject(project(), id)?.el;
      if (!el) return '';
      const state = useRuntimeStore.getState().elements[id] ?? {};
      if (el.type === 'checkbox') {
        if ('checked' in state) return state.checked;
        const p = el.props.checked;
        if (p?.kind === 'variable') return toBool(useRuntimeStore.getState().vars[p.variableId]);
        return p?.kind === 'static' ? Boolean(p.value) : false;
      }
      if ('value' in state) return state.value;
      const p = el.props.value;
      return p?.kind === 'static' ? toText(p.value) : '';
    },
    setElementProp: (id, prop, value) => {
      if (!alive()) return;
      const el = findInProject(project(), id)?.el;
      if (!el) return;
      let key = prop;
      if (prop === 'text' && (el.type === 'button' || el.type === 'checkbox')) key = 'label';
      setElementState(id, { [key]: value });
    },
    toast: (message) => alive() && pushToast(message),
    navigate: (screenId) => {
      if (!alive() || !project().screens.some((s) => s.id === screenId)) return;
      useRuntimeStore.setState({ screenId });
      void interpreter()?.trigger('screenLoad', (c) => c.screen === screenId);
    },
    storageGet: (key) => {
      const raw = localStorage.getItem(prefix + key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    storageSet: (key, value) => {
      if (alive()) localStorage.setItem(prefix + key, JSON.stringify(value ?? null));
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    httpRequest: async ({ method, url, headers, body, viaServer }) => {
      if (viaServer) {
        try {
          return await fetchViaServer({ method, url, headers, body });
        } catch (err) {
          throw new HostError((err as Error).message);
        }
      }
      const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      return { status: res.status, statusText: res.statusText, text: await res.text() };
    },
    tables: makeTables(alive),
    sendForm: async (form, values) => {
      const stopped = () => new HostError('The app was stopped.');
      if (!alive()) throw stopped();
      let result;
      try {
        result = await sendForm(project().id, form, values);
      } catch (err) {
        throw new HostError((err as Error).message);
      }
      if (!alive()) throw stopped();
      for (const m of result.messages) pushToast(m);
      if (!result.ok) throw new HostError(`The server workflow for form “${form}” stopped: ${result.error?.message ?? 'something went wrong.'}`);
      return result.reply;
    },
  };
}

/** A fresh interpreter over the current graph, so edits apply immediately. */
function interpreter(): Interpreter | null {
  if (!host || !useRuntimeStore.getState().running) return null;
  const gen = generation;
  const alive = () => gen === generation;
  return new Interpreter(project().graph, host, {
    onNodeRun: (nodeId, payload) => {
      flash(nodeId);
      if (alive()) logStep(nodeId, payload);
    },
    onInput: (nodeId, pinId, value) => alive() && logInput(nodeId, pinId, value),
    onError: (err) => {
      if (!alive()) return;
      logError(err.nodeId, err.message);
      onError(err);
    },
    onValue: (edgeId, value) => wireValue(gen, edgeId, value),
  });
}

export function startApp() {
  stopApp();
  const gen = ++generation;
  host = makeHost(gen);
  // The log of the last run stays after Stop, until the app runs again.
  clearRunLog();
  const p = project();
  const vars: Record<string, unknown> = {};
  for (const v of p.variables) vars[v.id] = structuredClone(v.initial);
  const screenId = p.screens[0].id;
  useRuntimeStore.setState({ ...initialRuntime, running: true, screenId, vars });

  const it = interpreter()!;
  for (const n of it.eventNodes('timer')) {
    const seconds = Math.max(0.1, toNumber(n.config.seconds ?? 1));
    timers.push(setInterval(() => void interpreter()?.runEvent(n.id), seconds * 1000));
  }
  void it.trigger('screenLoad', (c) => c.screen === screenId);
}

export function stopApp() {
  generation++;
  clearWires();
  timers.forEach(clearInterval);
  timers = [];
  host = null;
  useRuntimeStore.setState({ ...initialRuntime });
}

/** `card` is set when the button is inside a List's card. */
export function fireClick(elementId: string, card?: { item: unknown; index: number }) {
  void interpreter()?.trigger('click', (c) => c.element === elementId, card ? { ...card } : {});
}

export function fireChange(elementId: string, value: unknown) {
  void interpreter()?.trigger('change', (c) => c.element === elementId, { value });
}

export function fireListDelete(elementId: string, index: number, item: unknown) {
  void interpreter()?.trigger('listDelete', (c) => c.element === elementId, { index, item });
}
