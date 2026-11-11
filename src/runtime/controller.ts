// Connects the pure engine to the browser: runtime state, timers, storage.

import { toBool, toList, toNumber, toRecord, toText } from '../engine/convert';
import { Interpreter } from '../engine/interpreter';
import type { GraphError, HostApi } from '../engine/types';
import { appStoragePrefix } from '../model/persistence';
import { useProjectStore } from '../model/projectStore';
import { findInProject } from '../model/tree';
import type { Variable } from '../model/types';
import { initialRuntime, pushToast, setElementState, useRuntimeStore } from './runtimeStore';

let generation = 0;
let timers: ReturnType<typeof setInterval>[] = [];
let host: HostApi | null = null;

const project = () => useProjectStore.getState().project;

function coerce(type: Variable['type'] | undefined, value: unknown): unknown {
  switch (type) {
    case 'number':
      return toNumber(value);
    case 'boolean':
      return toBool(value);
    case 'list':
      return toList(value);
    case 'record':
      return toRecord(value);
    case 'text':
      return toText(value);
    default:
      return value;
  }
}

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

function onError(err: GraphError) {
  useRuntimeStore.setState({ error: { nodeId: err.nodeId, message: err.message } });
  pushToast(err.message, 'error', 5000);
}

function makeHost(gen: number): HostApi {
  const alive = () => gen === generation;
  const prefix = appStoragePrefix(project().id);
  return {
    getVar: (id) => useRuntimeStore.getState().vars[id],
    setVar: (id, value) => {
      if (!alive()) return;
      const v = project().variables.find((x) => x.id === id);
      useRuntimeStore.setState((s) => ({ vars: { ...s.vars, [id]: coerce(v?.type, value) } }));
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
  };
}

/** A fresh interpreter over the current graph, so edits apply immediately. */
function interpreter(): Interpreter | null {
  if (!host || !useRuntimeStore.getState().running) return null;
  return new Interpreter(project().graph, host, { onNodeRun: flash, onError });
}

export function startApp() {
  stopApp();
  const gen = ++generation;
  host = makeHost(gen);
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
