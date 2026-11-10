import { actionNodes } from './nodes/actions';
import { dataNodes } from './nodes/data';
import { eventNodes } from './nodes/events';
import { flowNodes } from './nodes/flow';
import type { NodeCategory, NodeDef, Pin } from './types';

const ALL: NodeDef[] = [...eventNodes, ...actionNodes, ...flowNodes, ...dataNodes];

export const NODE_DEFS: Record<string, NodeDef> = Object.fromEntries(ALL.map((d) => [d.type, d]));

export const CATEGORIES: { id: NodeCategory; label: string; color: string; hint: string }[] = [
  { id: 'events', label: 'When…', color: '#e8590c', hint: 'Start here: things that happen' },
  { id: 'actions', label: 'Do…', color: '#1c7ed6', hint: 'Things your app does' },
  { id: 'flow', label: 'Decide & repeat', color: '#9c36b5', hint: 'Choices and loops' },
  { id: 'data', label: 'Values', color: '#2f9e44', hint: 'Text, numbers, maths and checks' },
];

export function nodesInCategory(cat: NodeCategory): NodeDef[] {
  return ALL.filter((d) => d.category === cat);
}

export function getNodeDef(type: string): NodeDef | undefined {
  return NODE_DEFS[type];
}

export function findPin(def: NodeDef, side: 'in' | 'out', pinId: string): Pin | undefined {
  return (side === 'in' ? def.inputs : def.outputs).find((p) => p.id === pinId);
}

export function defaultConfig(def: NodeDef): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};
  for (const f of def.configFields) if (f.default !== undefined) cfg[f.key] = f.default;
  return cfg;
}

/**
 * Can an output pin be wired into an input pin? Exec only joins exec.
 * Data is forgiving: anything can become text, and numbers / yes-no values
 * convert automatically. Lists must go into list (or "any") inputs.
 */
export function canConnect(from: Pin, to: Pin): boolean {
  if (from.kind !== to.kind) return false;
  if (from.kind === 'exec') return true;
  const a = from.valueType ?? 'any';
  const b = to.valueType ?? 'any';
  if (a === 'any' || b === 'any' || a === b) return true;
  if (b === 'text') return true;
  if (a === 'list' || b === 'list') return false;
  return true; // text/number/boolean convert between each other
}
