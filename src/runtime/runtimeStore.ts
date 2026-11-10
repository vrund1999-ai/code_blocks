import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

export interface RuntimeState {
  running: boolean;
  screenId: string | null;
  /** Live variable values while the app runs. */
  vars: Record<string, unknown>;
  /** Per-element overrides set by logic (text, visibility, typed values…). */
  elements: Record<string, Record<string, unknown>>;
  toasts: Toast[];
  /** Nodes currently lit up because they just ran. */
  flashing: Record<string, true>;
  error: { nodeId: string; message: string } | null;
}

export const initialRuntime: RuntimeState = {
  running: false,
  screenId: null,
  vars: {},
  elements: {},
  toasts: [],
  flashing: {},
  error: null,
};

export const useRuntimeStore = create<RuntimeState>()(() => ({ ...initialRuntime }));

export function setElementState(id: string, patch: Record<string, unknown>) {
  useRuntimeStore.setState((s) => ({
    elements: { ...s.elements, [id]: { ...s.elements[id], ...patch } },
  }));
}

let toastId = 0;
export function pushToast(message: string, kind: Toast['kind'] = 'info', ms = 3000) {
  const id = ++toastId;
  useRuntimeStore.setState((s) => ({ toasts: [...s.toasts, { id, message, kind }].slice(-4) }));
  setTimeout(() => {
    useRuntimeStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, ms);
}
