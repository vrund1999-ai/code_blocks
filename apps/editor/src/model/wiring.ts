// Wires without a mouse: each pin of a block, what it is wired to, and what it could be.

import { canConnect, defaultConfig, getNodeDef, inputPins, outputPins } from '@code-blocks/engine/registry';
import type { NameLookup, Pin } from '@code-blocks/engine/types';
import { makeNameLookup } from './tree';
import type { GraphEdge, GraphNode, Project } from './types';
import { describeBlock } from './usage';

/** A pin on another block, at the other end of a wire. */
export interface PinEnd {
  nodeId: string;
  pinId: string;
  /** Such as “Change “points” by: By”. */
  label: string;
}

export interface PinWires {
  pin: Pin;
  side: 'in' | 'out';
  /** What the pin is called here: data pins by their names, the arrows by where they lead. */
  label: string;
  wires: (PinEnd & { edgeId: string })[];
  /** Pins on other blocks a new wire could go to. */
  choices: PinEnd[];
}

function pinsOf(node: GraphNode, side: 'in' | 'out', names: NameLookup): Pin[] {
  const def = getNodeDef(node.type);
  if (!def) return [];
  const config = { ...defaultConfig(def), ...node.config };
  return side === 'in' ? inputPins(def, config) : outputPins(def, config, names);
}

/** A pin's name. The arrow into a block is “Comes from”; the one out of it is “Then”. */
export function pinLabel(pin: Pin, side: 'in' | 'out'): string {
  if (pin.kind === 'exec' && side === 'in') return 'Comes from';
  if (pin.kind === 'exec' && pin.id === 'next') return 'Then';
  return pin.label;
}

/** The pins of a block, each with its wires and the pins it could be wired to. */
export function pinWires(project: Project, nodeId: string): PinWires[] {
  const { nodes, edges } = project.graph;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return [];
  const names = makeNameLookup(project);
  const end = (n: GraphNode, pin: Pin, side: 'in' | 'out'): PinEnd => ({
    nodeId: n.id,
    pinId: pin.id,
    label: `${describeBlock(n, names)}: ${pinLabel(pin, side)}`,
  });
  const result: PinWires[] = [];
  for (const side of ['in', 'out'] as const) {
    const other = side === 'in' ? 'out' : 'in';
    for (const pin of pinsOf(node, side, names)) {
      const wires: PinWires['wires'] = [];
      for (const e of edges) {
        const mine = side === 'in' ? e.target === nodeId && e.targetPin === pin.id : e.source === nodeId && e.sourcePin === pin.id;
        if (!mine) continue;
        const otherId = side === 'in' ? e.source : e.target;
        const otherPinId = side === 'in' ? e.sourcePin : e.targetPin;
        const n = nodes.find((x) => x.id === otherId);
        const p = n && pinsOf(n, other, names).find((x) => x.id === otherPinId);
        if (n && p) wires.push({ ...end(n, p, other), edgeId: e.id });
      }
      const choices: PinEnd[] = [];
      for (const n of nodes) {
        if (n.id === nodeId) continue;
        for (const p of pinsOf(n, other, names)) {
          const fits = side === 'in' ? canConnect(p, pin) : canConnect(pin, p);
          if (fits && !wires.some((w) => w.nodeId === n.id && w.pinId === p.id)) choices.push(end(n, p, other));
        }
      }
      result.push({ pin, side, label: pinLabel(pin, side), wires, choices });
    }
  }
  return result;
}

/** The wire from a pin of a block to a pin on another one, the right way round. */
export function wireBetween(nodeId: string, pins: PinWires, to: PinEnd): Omit<GraphEdge, 'id'> {
  return pins.side === 'out'
    ? { source: nodeId, sourcePin: pins.pin.id, target: to.nodeId, targetPin: to.pinId, kind: pins.pin.kind }
    : { source: to.nodeId, sourcePin: to.pinId, target: nodeId, targetPin: pins.pin.id, kind: pins.pin.kind };
}
