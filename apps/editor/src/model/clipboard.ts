// Copy and paste: copies of elements and blocks that get fresh ids when
// pasted, so the same copy can be pasted many times, even into another project.

import { getNodeDef } from '@code-blocks/engine/registry';
import { defaultProps } from './elements';
import { newId, nextName } from './factory';
import { allElements, findInProject, walk } from './tree';
import type { GraphEdge, GraphNode, Project, UIElement } from './types';

export type Clip =
  | { kind: 'elements'; elements: UIElement[] }
  /** Blocks with the wires between them. `pastes` moves each paste a bit further. */
  | { kind: 'nodes'; nodes: GraphNode[]; edges: GraphEdge[]; pastes: number };

/** How far each pasted copy of blocks is moved from the last one. */
export const PASTE_OFFSET = 40;

/** A name for a copy: "Button 1" → "Button 2" (or the next free number), "Card" → "Card 2". */
export function copyName(taken: string[], name: string): string {
  const numbered = /^(.*\S) (\d+)$/.exec(name);
  if (!numbered) return nextName(taken, name);
  const used = new Set(taken);
  let i = Number(numbered[2]) + 1;
  while (used.has(`${numbered[1]} ${i}`)) i++;
  return `${numbered[1]} ${i}`;
}

/**
 * Copies of elements with new ids and unused names ("Say Hello 2"), with
 * settings linked to variables the project doesn't have put back to normal.
 */
export function cloneElements(elements: UIElement[], project: Project): UIElement[] {
  const taken = allElements(project).map((e) => e.name);
  const vars = new Set(project.variables.map((v) => v.id));
  return elements.map((original) => {
    const copy = structuredClone(original);
    walk(copy, (el) => {
      el.id = newId();
      el.name = copyName(taken, el.name);
      taken.push(el.name);
      const defaults = defaultProps(el.type);
      for (const [key, value] of Object.entries(el.props)) {
        if (value.kind === 'variable' && !vars.has(value.variableId)) {
          if (defaults[key]) el.props[key] = defaults[key];
          else delete el.props[key];
        }
      }
    });
    return copy;
  });
}

/**
 * Copies of blocks with new ids, moved by `offset`, keeping only the wires
 * between them. Settings that point at an element, variable or screen the
 * project doesn't have are cleared, so the block asks for one again.
 */
export function cloneNodes(
  nodes: GraphNode[],
  edges: GraphEdge[],
  project: Project,
  offset: { x: number; y: number },
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const ids = new Map(nodes.map((n) => [n.id, newId()]));
  const exists = {
    element: (id: unknown) => typeof id === 'string' && findInProject(project, id) !== null,
    variable: (id: unknown) => project.variables.some((v) => v.id === id),
    screen: (id: unknown) => project.screens.some((s) => s.id === id),
  };
  const copies = nodes.map((n) => {
    const config = structuredClone(n.config);
    for (const f of getNodeDef(n.type)?.configFields ?? []) {
      if ((f.type === 'element' || f.type === 'variable' || f.type === 'screen') && f.key in config) {
        if (!exists[f.type](config[f.key])) delete config[f.key];
      }
    }
    return {
      id: ids.get(n.id)!,
      type: n.type,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
      config,
    };
  });
  const wires = edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ ...e, id: newId(), source: ids.get(e.source)!, target: ids.get(e.target)! }));
  return { nodes: copies, edges: wires };
}
