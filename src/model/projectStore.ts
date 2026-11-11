import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { defaultConfig, getNodeDef, inputPins } from '../engine/registry';
import { ELEMENT_DEFS } from './elements';
import { defaultInitial, makeElement, makeProject, makeScreen, newId, nextElementName, nextName } from './factory';
import { canPlaceInside, collectIds, findElement, findInProject, findParent } from './tree';
import type { ElementType, GraphEdge, Project, PropValue, Variable } from './types';

export type Tab = 'design' | 'logic';
export type Selection = { kind: 'element'; id: string } | { kind: 'node'; id: string } | null;

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

interface State {
  project: Project;
  tab: Tab;
  activeScreenId: string;
  selection: Selection;
  past: Project[];
  future: Project[];
  /** Used to merge rapid edits (typing) into one undo step. */
  lastEdit: { key: string; at: number } | null;
}

interface Actions {
  loadProject(project: Project): void;
  setTab(tab: Tab): void;
  select(sel: Selection): void;
  setActiveScreen(id: string): void;
  renameProject(name: string): void;

  addElement(type: ElementType, parentId: string, index?: number): string;
  moveElement(id: string, parentId: string, index: number): void;
  setElementProp(id: string, key: string, value: PropValue): void;
  renameElement(id: string, name: string): void;
  deleteElement(id: string): void;

  addScreen(): string;
  renameScreen(id: string, name: string): void;
  deleteScreen(id: string): void;

  addVariable(type: Variable['type']): string;
  updateVariable(id: string, patch: Partial<Omit<Variable, 'id'>>): void;
  deleteVariable(id: string): void;

  addNode(type: string, position: { x: number; y: number }, config?: Record<string, unknown>): string;
  updateNodeConfig(id: string, patch: Record<string, unknown>): void;
  moveNodes(positions: Record<string, { x: number; y: number }>): void;
  deleteNodes(ids: string[]): void;
  addEdge(edge: Omit<GraphEdge, 'id'>): void;
  deleteEdges(ids: string[]): void;

  undo(): void;
  redo(): void;
}

export type ProjectStore = State & Actions;

function initialState(project: Project): State {
  return {
    project,
    tab: 'design',
    activeScreenId: project.screens[0].id,
    selection: null,
    past: [],
    future: [],
    lastEdit: null,
  };
}

export const useProjectStore = create<ProjectStore>()(
  immer((set, get) => {
    /**
     * Apply a change to the project and record it for undo. Edits sharing a
     * `coalesce` key within a second (e.g. typing in a field) become one step.
     */
    const mutate = (fn: (p: Project) => void, coalesce?: string) => {
      const before = get().project;
      set((s) => {
        fn(s.project as Project);
        const now = Date.now();
        const merge = coalesce && s.lastEdit?.key === coalesce && now - s.lastEdit.at < COALESCE_MS;
        if (!merge) {
          s.past.push(before);
          if (s.past.length > HISTORY_LIMIT) s.past.shift();
        }
        s.future = [];
        s.lastEdit = coalesce ? { key: coalesce, at: now } : null;
      });
    };

    return {
      ...initialState(makeProject()),

      loadProject: (project) => set(() => initialState(project)),
      setTab: (tab) => set((s) => void (s.tab = tab)),
      select: (sel) => set((s) => void (s.selection = sel)),
      setActiveScreen: (id) =>
        set((s) => {
          s.activeScreenId = id;
          if (s.selection?.kind === 'element') s.selection = null;
        }),
      renameProject: (name) => mutate((p) => void (p.name = name), 'project-name'),

      // ---- UI elements ------------------------------------------------------
      addElement: (type, parentId, index) => {
        const el = makeElement(type, nextElementName(get().project, type));
        const where = findInProject(get().project, parentId);
        if (!where || !canPlaceInside(where.screen.root, parentId, type)) return '';
        mutate((p) => {
          const parent = findInProject(p, parentId)!.el;
          const i = index ?? parent.children.length;
          parent.children.splice(i, 0, el);
        });
        set((s) => void (s.selection = { kind: 'element', id: el.id }));
        return el.id;
      },

      moveElement: (id, parentId, index) =>
        mutate((p) => {
          const found = findInProject(p, id);
          if (!found) return;
          // Can't drop an element inside itself.
          if (findElement(found.el, parentId)) return;
          const target = findInProject(p, parentId);
          if (!target || !canPlaceInside(target.screen.root, parentId, found.el)) return;
          const oldParent = findParent(found.screen.root, id);
          if (!oldParent) return;
          const oldIndex = oldParent.children.findIndex((c) => c.id === id);
          const [el] = oldParent.children.splice(oldIndex, 1);
          let i = index;
          if (oldParent.id === target.el.id && oldIndex < index) i -= 1;
          target.el.children.splice(Math.max(0, Math.min(i, target.el.children.length)), 0, el);
        }),

      setElementProp: (id, key, value) =>
        mutate((p) => {
          const el = findInProject(p, id)?.el;
          if (el) el.props[key] = value;
        }, `prop:${id}:${key}`),

      renameElement: (id, name) =>
        mutate((p) => {
          const el = findInProject(p, id)?.el;
          if (el) el.name = name;
        }, `name:${id}`),

      deleteElement: (id) => {
        mutate((p) => {
          const found = findInProject(p, id);
          if (!found) return;
          const parent = findParent(found.screen.root, id);
          if (!parent) return; // never delete a screen root
          const removed = new Set(collectIds(found.el));
          parent.children = parent.children.filter((c) => c.id !== id);
          // Blocks that pointed at a deleted element now point at nothing.
          for (const n of p.graph.nodes) {
            if (typeof n.config.element === 'string' && removed.has(n.config.element)) {
              delete n.config.element;
            }
          }
        });
        set((s) => {
          if (s.selection?.kind === 'element' && s.selection.id === id) s.selection = null;
        });
      },

      // ---- Screens ------------------------------------------------------------
      addScreen: () => {
        const screen = makeScreen(nextName(get().project.screens.map((s) => s.name), 'Screen'));
        mutate((p) => void p.screens.push(screen));
        set((s) => void (s.activeScreenId = screen.id));
        return screen.id;
      },
      renameScreen: (id, name) =>
        mutate((p) => {
          const s = p.screens.find((x) => x.id === id);
          if (s) s.name = name;
        }, `screen:${id}`),
      deleteScreen: (id) => {
        if (get().project.screens.length <= 1) return;
        const screen = get().project.screens.find((s) => s.id === id);
        if (!screen) return;
        const removed = new Set(collectIds(screen.root));
        mutate((p) => {
          p.screens = p.screens.filter((s) => s.id !== id);
          for (const n of p.graph.nodes) {
            if (n.config.screen === id) delete n.config.screen;
            if (typeof n.config.element === 'string' && removed.has(n.config.element)) delete n.config.element;
          }
        });
        set((s) => {
          if (s.activeScreenId === id) s.activeScreenId = s.project.screens[0].id;
          s.selection = null;
        });
      },

      // ---- Variables ----------------------------------------------------------
      addVariable: (type) => {
        const names = get().project.variables.map((v) => v.name);
        const base = { list: 'my list', number: 'my number', boolean: 'my switch', record: 'my record', text: 'my text' }[type];
        const v: Variable = { id: newId(), name: nextName(names, base), type, initial: defaultInitial(type) };
        mutate((p) => void p.variables.push(v));
        return v.id;
      },
      updateVariable: (id, patch) =>
        mutate((p) => {
          const v = p.variables.find((x) => x.id === id);
          if (!v) return;
          if (patch.type && patch.type !== v.type) v.initial = defaultInitial(patch.type);
          Object.assign(v, patch);
        }, `var:${id}:${Object.keys(patch).join(',')}`),
      deleteVariable: (id) =>
        mutate((p) => {
          p.variables = p.variables.filter((v) => v.id !== id);
          for (const n of p.graph.nodes) if (n.config.variable === id) delete n.config.variable;
          for (const s of p.screens) {
            const visit = (el: Project['screens'][number]['root']) => {
              for (const [k, pv] of Object.entries(el.props)) {
                if (pv.kind === 'variable' && pv.variableId === id) {
                  el.props[k] = { kind: 'static', value: ELEMENT_DEFS[el.type].defaults[k] };
                }
              }
              el.children.forEach(visit);
            };
            visit(s.root);
          }
        }),

      // ---- Logic graph ----------------------------------------------------------
      addNode: (type, position, config = {}) => {
        const def = getNodeDef(type);
        const id = newId();
        mutate((p) =>
          void p.graph.nodes.push({ id, type, position, config: { ...(def ? defaultConfig(def) : {}), ...config } }),
        );
        set((s) => void (s.selection = { kind: 'node', id }));
        return id;
      },
      updateNodeConfig: (id, patch) =>
        mutate((p) => {
          const n = p.graph.nodes.find((x) => x.id === id);
          if (!n) return;
          const def = getNodeDef(n.type);
          const pinsNow = () =>
            def?.dynamicInputs ? inputPins(def, { ...defaultConfig(def), ...n.config }).map((x) => x.id) : [];
          const before = pinsNow();
          Object.assign(n.config, patch);
          // Blocks whose pins follow their settings (e.g. one pin per record
          // field) drop the wires and typed-in values of pins that are gone.
          const after = new Set(pinsNow());
          const gone = new Set(before.filter((pin) => !after.has(pin)));
          if (gone.size === 0) return;
          p.graph.edges = p.graph.edges.filter((e) => e.target !== id || !gone.has(e.targetPin));
          for (const pin of gone) delete n.config[pin];
        }, `node:${id}:${Object.keys(patch).join(',')}`),
      moveNodes: (positions) =>
        mutate((p) => {
          for (const n of p.graph.nodes) if (positions[n.id]) n.position = positions[n.id];
        }),
      deleteNodes: (ids) => {
        const gone = new Set(ids);
        mutate((p) => {
          p.graph.nodes = p.graph.nodes.filter((n) => !gone.has(n.id));
          p.graph.edges = p.graph.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target));
        });
        set((s) => {
          if (s.selection?.kind === 'node' && gone.has(s.selection.id)) s.selection = null;
        });
      },
      addEdge: (edge) =>
        mutate((p) => {
          if (edge.source === edge.target) return;
          // A data input takes one value; an exec output leads to one next step.
          p.graph.edges = p.graph.edges.filter((e) =>
            edge.kind === 'data'
              ? !(e.kind === 'data' && e.target === edge.target && e.targetPin === edge.targetPin)
              : !(e.kind === 'exec' && e.source === edge.source && e.sourcePin === edge.sourcePin),
          );
          p.graph.edges.push({ ...edge, id: newId() });
        }),
      deleteEdges: (ids) => {
        const gone = new Set(ids);
        mutate((p) => void (p.graph.edges = p.graph.edges.filter((e) => !gone.has(e.id))));
      },

      // ---- History --------------------------------------------------------------
      undo: () =>
        set((s) => {
          const prev = s.past.pop();
          if (!prev) return;
          s.future.push(s.project);
          s.project = prev;
          s.lastEdit = null;
          fixSelection(s);
        }),
      redo: () =>
        set((s) => {
          const next = s.future.pop();
          if (!next) return;
          s.past.push(s.project);
          s.project = next;
          s.lastEdit = null;
          fixSelection(s);
        }),
    };
  }),
);

/** After undo/redo, drop references to things that no longer exist. */
function fixSelection(s: State) {
  if (!s.project.screens.some((x) => x.id === s.activeScreenId)) s.activeScreenId = s.project.screens[0].id;
  const sel = s.selection;
  if (sel?.kind === 'element' && !findInProject(s.project, sel.id)) s.selection = null;
  if (sel?.kind === 'node' && !s.project.graph.nodes.some((n) => n.id === sel.id)) s.selection = null;
}
