// "Where is this used?": the blocks and elements that point at an element or a variable.

import { defaultConfig, getNodeDef } from '@code-blocks/engine/registry';
import { ELEMENT_DEFS } from './elements';
import { makeNameLookup, walk } from './tree';
import type { Project } from './types';

export type Use =
  | { kind: 'block'; id: string; label: string }
  | { kind: 'element'; id: string; screenId: string; label: string };

/** Blocks with a setting of this kind (element or variable) set to `id`, described by their sentences. */
function blocksUsing(project: Project, kind: 'element' | 'variable', id: string): Use[] {
  const names = makeNameLookup(project);
  const uses: Use[] = [];
  for (const node of project.graph.nodes) {
    const def = getNodeDef(node.type);
    if (!def?.configFields.some((f) => f.type === kind && node.config[f.key] === id)) continue;
    const config = { ...defaultConfig(def), ...node.config };
    uses.push({ kind: 'block', id: node.id, label: def.sentence?.(config, names) ?? def.label });
  }
  return uses;
}

/** The blocks that point at an element. */
export function usesOfElement(project: Project, elementId: string): Use[] {
  return blocksUsing(project, 'element', elementId);
}

/** The blocks that read or change a variable, then the element settings linked to it. */
export function usesOfVariable(project: Project, variableId: string): Use[] {
  const uses = blocksUsing(project, 'variable', variableId);
  for (const screen of project.screens) {
    walk(screen.root, (el) => {
      for (const [key, pv] of Object.entries(el.props)) {
        if (pv.kind !== 'variable' || pv.variableId !== variableId) continue;
        const setting = ELEMENT_DEFS[el.type].fields.find((f) => f.key === key)?.label ?? key;
        const name = el.id === screen.root.id ? `Screen “${screen.name}”` : `“${el.name}”`;
        uses.push({ kind: 'element', id: el.id, screenId: screen.id, label: `${name}: ${setting}` });
      }
    });
  }
  return uses;
}
