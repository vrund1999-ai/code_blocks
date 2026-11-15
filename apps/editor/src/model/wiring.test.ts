import { describe, expect, it } from 'vitest';
import { makeElement, makeProject } from './factory';
import type { GraphNode } from './types';
import { pinWires, wireBetween } from './wiring';

const node = (id: string, type: string, config: Record<string, unknown>): GraphNode => ({ id, type, config, position: { x: 0, y: 0 } });

function project() {
  const p = makeProject();
  const save = makeElement('button', 'Save', { label: 'Save' });
  p.screens[0].root.children.push(save);
  p.variables.push({ id: 'v1', name: 'points', type: 'number', initial: 0 });
  p.graph.nodes.push(
    node('click', 'event.click', { element: save.id }),
    node('add', 'action.changeVariable', { variable: 'v1' }),
    node('get', 'data.getVariable', { variable: 'v1' }),
    node('toast', 'action.toast', {}),
  );
  p.graph.edges.push({ id: 'e1', source: 'click', sourcePin: 'next', target: 'add', targetPin: 'in', kind: 'exec' });
  return p;
}

describe('a block’s wires as a list', () => {
  it('names each pin, with what it is wired to', () => {
    const pins = pinWires(project(), 'add');
    expect(pins.map((p) => [p.side, p.label])).toEqual([
      ['in', 'Comes from'],
      ['in', 'Amount'],
      ['out', 'Then'],
    ]);
    expect(pins[0].wires).toEqual([{ nodeId: 'click', pinId: 'next', label: 'When “Save” is clicked: Then', edgeId: 'e1' }]);
    expect(pins[1].wires).toEqual([]);
  });

  it('offers only pins on other blocks that fit, and not ones already wired', () => {
    const pins = pinWires(project(), 'add');
    // The arrow in: from any other block's arrow out, but not the click block's, which is wired already.
    expect(pins[0].choices.map((c) => c.nodeId)).toEqual(['toast']);
    // A number: the variable's value fits; the arrows don't.
    expect(pins[1].choices).toEqual([{ nodeId: 'get', pinId: 'value', label: '“points”: Value' }]);
    // The arrow out: into the toast block's arrow in.
    expect(pins[2].choices.map((c) => [c.nodeId, c.pinId])).toEqual([['toast', 'in']]);
  });

  it('makes the wire the right way round from either end', () => {
    const [comesFrom, amount, then] = pinWires(project(), 'add');
    expect(wireBetween('add', then, then.choices[0])).toEqual({
      source: 'add',
      sourcePin: 'next',
      target: 'toast',
      targetPin: 'in',
      kind: 'exec',
    });
    expect(wireBetween('add', amount, amount.choices[0])).toEqual({
      source: 'get',
      sourcePin: 'value',
      target: 'add',
      targetPin: 'amount',
      kind: 'data',
    });
    expect(wireBetween('add', comesFrom, comesFrom.choices[0]).target).toBe('add');
  });

  it('is empty for a block that is gone', () => {
    expect(pinWires(project(), 'nope')).toEqual([]);
  });
});
