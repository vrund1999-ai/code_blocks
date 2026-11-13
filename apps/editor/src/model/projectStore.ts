import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { defaultConfig, getNodeDef, inputPins } from '@code-blocks/engine/registry';
import { cloneElements, cloneNodes, PASTE_OFFSET, type Clip } from './clipboard';
import { ELEMENT_DEFS } from './elements';
import { defaultInitial, makeElement, makeProject, makeScreen, newId, nextElementName, nextName } from './factory';
import { canPlaceInside, collectIds, findElement, findInProject, findParent } from './tree';
import type { ColumnType, ElementType, GraphEdge, Project, PropValue, TableColumn, UIElement, Variable } from './types';

export type Tab = 'design' | 'logic' | 'data';
/** `ids` lists every selected block when there are several; `id` is the main one. */
export type Selection = { kind: 'element'; id: string } | { kind: 'node'; id: string; ids?: string[] } | null;

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
  /** What was last copied. Kept when another project is opened. */
  clipboard: Clip | null;
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

  /** Adds a table with one text column, "Name". */
  addTable(): string;
  renameTable(id: string, name: string): void;
  deleteTable(id: string): void;
  addColumn(tableId: string, type: ColumnType): string;
  updateColumn(tableId: string, columnId: string, patch: Partial<Omit<TableColumn, 'id'>>): void;
  /** Moves a column one place left (-1) or right (1). */
  moveColumn(tableId: string, columnId: string, by: -1 | 1): void;
  deleteColumn(tableId: string, columnId: string): void;

  addNode(type: string, position: { x: number; y: number }, config?: Record<string, unknown>): string;
  updateNodeConfig(id: string, patch: Record<string, unknown>): void;
  moveNodes(positions: Record<string, { x: number; y: number }>): void;
  deleteNodes(ids: string[]): void;
  addEdge(edge: Omit<GraphEdge, 'id'>): void;
  /**
   * Adds a block wired to a pin of another block, as one undo step. `from`
   * is the pin the wire was dragged out of; `pin` is the new block's pin.
   */
  addWiredNode(
    type: string,
    position: { x: number; y: number },
    from: { nodeId: string; pinId: string; side: 'in' | 'out' },
    pin: string,
    kind: GraphEdge['kind'],
  ): string;
  deleteEdges(ids: string[]): void;

  /** Copies the selected element or blocks. Returns how many things were copied. */
  copySelection(): number;
  /** Copies the selection, then deletes it. */
  cutSelection(): number;
  /** Pastes what was copied: elements in the Design tab, blocks in the Logic tab. Returns the new ids. */
  paste(): string[];
  /** Copies and pastes the selection in one go, leaving the clipboard alone. */
  duplicateSelection(): string[];

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
    clipboard: null,
  };
}

/**
 * Adds a wire. A data input takes one value and an exec output leads to one
 * next step, so a wire already there is replaced.
 */
function pushEdge(p: Project, edge: Omit<GraphEdge, 'id'>) {
  if (edge.source === edge.target) return;
  p.graph.edges = p.graph.edges.filter((e) =>
    edge.kind === 'data'
      ? !(e.kind === 'data' && e.target === edge.target && e.targetPin === edge.targetPin)
      : !(e.kind === 'exec' && e.source === edge.source && e.sourcePin === edge.sourcePin),
  );
  p.graph.edges.push({ ...edge, id: newId() });
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

    /** Puts a copy of `clip` (the clipboard by default) into the project and selects it. */
    const pasteClip = (times: number, clip = get().clipboard): string[] => {
      if (!clip) return [];
      const { project } = get();
      if (clip.kind === 'nodes') {
        const d = PASTE_OFFSET * times;
        const copy = cloneNodes(clip.nodes, clip.edges, project, { x: d, y: d });
        mutate((p) => {
          p.graph.nodes.push(...copy.nodes);
          p.graph.edges.push(...copy.edges);
        });
        const ids = copy.nodes.map((n) => n.id);
        set((s) => void (s.selection = { kind: 'node', id: ids[ids.length - 1], ids }));
        return ids;
      }
      const elements = cloneElements(clip.elements, project);
      const { parentId, index } = pasteSpot(get(), elements);
      mutate((p) => {
        const parent = findInProject(p, parentId)!.el;
        parent.children.splice(index ?? parent.children.length, 0, ...elements);
      });
      set((s) => void (s.selection = { kind: 'element', id: elements[0].id }));
      return elements.map((e) => e.id);
    };

    return {
      ...initialState(makeProject()),

      loadProject: (project) => set((s) => ({ ...initialState(project), clipboard: s.clipboard })),
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

      // ---- Data tables ----------------------------------------------------------
      addTable: () => {
        const id = newId();
        const name = nextName(get().project.tables.map((t) => t.name), 'My table');
        mutate((p) => void p.tables.push({ id, name, columns: [{ id: newId(), name: 'Name', type: 'text' }] }));
        return id;
      },
      renameTable: (id, name) =>
        mutate((p) => {
          const t = p.tables.find((x) => x.id === id);
          if (t) t.name = name;
        }, `table:${id}:name`),
      deleteTable: (id) =>
        mutate((p) => {
          p.tables = p.tables.filter((t) => t.id !== id);
          // Table blocks that used it ask for a table again (undo brings both back).
          for (const n of p.graph.nodes) if (n.config.table === id) delete n.config.table;
        }),
      addColumn: (tableId, type) => {
        const table = get().project.tables.find((t) => t.id === tableId);
        if (!table) return '';
        const id = newId();
        const base = { text: 'Text', number: 'Number', boolean: 'Yes or no' }[type];
        const name = nextName(table.columns.map((c) => c.name), base);
        mutate((p) => void p.tables.find((t) => t.id === tableId)!.columns.push({ id, name, type }));
        return id;
      },
      updateColumn: (tableId, columnId, patch) =>
        mutate((p) => {
          const col = p.tables.find((t) => t.id === tableId)?.columns.find((c) => c.id === columnId);
          if (col) Object.assign(col, patch);
        }, `column:${columnId}:${Object.keys(patch).join(',')}`),
      moveColumn: (tableId, columnId, by) => {
        const cols = get().project.tables.find((t) => t.id === tableId)?.columns ?? [];
        const i = cols.findIndex((c) => c.id === columnId);
        // Nothing to do at either end, so no empty undo step.
        if (i < 0 || i + by < 0 || i + by >= cols.length) return;
        mutate((p) => {
          const list = p.tables.find((t) => t.id === tableId)!.columns;
          const [col] = list.splice(i, 1);
          list.splice(i + by, 0, col);
        });
      },
      deleteColumn: (tableId, columnId) =>
        mutate((p) => {
          const t = p.tables.find((x) => x.id === tableId);
          if (t) t.columns = t.columns.filter((c) => c.id !== columnId);
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
        set((s) => fixSelection(s));
      },
      addEdge: (edge) => mutate((p) => pushEdge(p, edge)),
      addWiredNode: (type, position, from, pin, kind) => {
        const def = getNodeDef(type);
        const id = newId();
        mutate((p) => {
          p.graph.nodes.push({ id, type, position, config: def ? defaultConfig(def) : {} });
          pushEdge(
            p,
            from.side === 'out'
              ? { source: from.nodeId, sourcePin: from.pinId, target: id, targetPin: pin, kind }
              : { source: id, sourcePin: pin, target: from.nodeId, targetPin: from.pinId, kind },
          );
        });
        set((s) => void (s.selection = { kind: 'node', id }));
        return id;
      },
      deleteEdges: (ids) => {
        const gone = new Set(ids);
        mutate((p) => void (p.graph.edges = p.graph.edges.filter((e) => !gone.has(e.id))));
      },

      // ---- Copy and paste ---------------------------------------------------------
      copySelection: () => {
        const clip = copyOf(get());
        if (!clip) return 0;
        set((s) => void (s.clipboard = clip));
        return clip.kind === 'elements' ? clip.elements.length : clip.nodes.length;
      },
      cutSelection: () => {
        const clip = copyOf(get());
        if (!clip) return 0;
        set((s) => void (s.clipboard = clip));
        if (clip.kind === 'elements') {
          get().deleteElement(clip.elements[0].id);
          return clip.elements.length;
        }
        get().deleteNodes(clip.nodes.map((n) => n.id));
        return clip.nodes.length;
      },
      paste: () => {
        const clip = get().clipboard;
        if (!clip || get().tab !== (clip.kind === 'elements' ? 'design' : 'logic')) return [];
        if (clip.kind === 'nodes') set((s) => void (s.clipboard = { ...clip, pastes: clip.pastes + 1 }));
        return pasteClip(clip.kind === 'nodes' ? clip.pastes + 1 : 1);
      },
      duplicateSelection: () => {
        const clip = copyOf(get());
        return clip ? pasteClip(1, clip) : [];
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

/** A copy of what is selected in the open tab: an element, or blocks with the wires between them. */
function copyOf(s: State): Clip | null {
  const sel = s.selection;
  if (s.tab === 'design' && sel?.kind === 'element') {
    const found = findInProject(s.project, sel.id);
    // A screen's background can't be copied: it isn't inside anything.
    if (!found || found.screen.root.id === sel.id) return null;
    return { kind: 'elements', elements: [structuredClone(found.el)] };
  }
  if (s.tab === 'logic' && sel?.kind === 'node') {
    const ids = new Set(sel.ids ?? [sel.id]);
    const nodes = s.project.graph.nodes.filter((n) => ids.has(n.id));
    if (!nodes.length) return null;
    const edges = s.project.graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    return { kind: 'nodes', nodes: structuredClone(nodes), edges: structuredClone(edges), pastes: 0 };
  }
  return null;
}

/**
 * Where pasted elements go: right after the selected element on the open
 * screen, or at the end of the screen when nothing is selected or they can't
 * go there (such as a text box into a List's cards).
 */
function pasteSpot(s: State, elements: UIElement[]): { parentId: string; index?: number } {
  const screen = s.project.screens.find((x) => x.id === s.activeScreenId) ?? s.project.screens[0];
  const sel = s.selection;
  if (sel?.kind === 'element') {
    const parent = findParent(screen.root, sel.id);
    if (parent && elements.every((el) => canPlaceInside(screen.root, parent.id, el))) {
      return { parentId: parent.id, index: parent.children.findIndex((c) => c.id === sel.id) + 1 };
    }
  }
  return { parentId: screen.root.id };
}

/** After undo/redo, drop references to things that no longer exist. */
function fixSelection(s: State) {
  if (!s.project.screens.some((x) => x.id === s.activeScreenId)) s.activeScreenId = s.project.screens[0].id;
  const sel = s.selection;
  if (sel?.kind === 'element' && !findInProject(s.project, sel.id)) s.selection = null;
  if (sel?.kind === 'node') {
    const ids = (sel.ids ?? [sel.id]).filter((id) => s.project.graph.nodes.some((n) => n.id === id));
    s.selection = ids.length ? { kind: 'node', id: ids.includes(sel.id) ? sel.id : ids[ids.length - 1], ids } : null;
  }
}
