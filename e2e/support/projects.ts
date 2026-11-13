// Builds projects in Node using the app's own model code, so test fixtures
// always match the real project format.
import { makeElement, makeProject, makeScreen, newId } from '../../apps/editor/src/model/factory';
import type { ElementType, GraphEdge, GraphNode, Project, UIElement, Variable } from '../../apps/editor/src/model/types';
import { TEMPLATES } from '../../apps/editor/src/templates';

export function template(id: 'blank' | 'hello' | 'counter' | 'todo'): Project {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`No template "${id}"`);
  return t.create();
}

/** A small fluent builder for test projects. */
export function build(name = 'Test App') {
  const project = makeProject(name);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  project.graph = { nodes, edges };

  const api = {
    project,
    root: project.screens[0].root,
    screen: project.screens[0],
    element(type: ElementType, elName: string, props: Record<string, unknown> = {}, parent?: UIElement) {
      const el = makeElement(type, elName, props);
      (parent ?? api.root).children.push(el);
      return el;
    },
    variable(varName: string, type: Variable['type'], initial: unknown): Variable {
      const v: Variable = { id: newId(), name: varName, type, initial };
      project.variables.push(v);
      return v;
    },
    addScreen(screenName: string) {
      const s = makeScreen(screenName);
      project.screens.push(s);
      return s;
    },
    /** Adds a block; blocks are laid out on a grid unless a position is given. */
    node(type: string, config: Record<string, unknown> = {}, pos?: { x: number; y: number }) {
      const id = newId();
      const i = nodes.length;
      nodes.push({ id, type, position: pos ?? { x: 40 + (i % 3) * 320, y: 40 + Math.floor(i / 3) * 240 }, config });
      return id;
    },
    exec(source: string, sourcePin: string, target: string) {
      edges.push({ id: newId(), source, sourcePin, target, targetPin: 'in', kind: 'exec' });
    },
    data(source: string, sourcePin: string, target: string, targetPin: string) {
      edges.push({ id: newId(), source, sourcePin, target, targetPin, kind: 'data' });
    },
  };
  return api;
}
