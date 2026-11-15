import { describe, expect, it } from 'vitest';
import { makeElement, makeProject, makeScreen } from './factory';
import type { GraphNode } from './types';
import { usesOfElement, usesOfVariable } from './usage';

const node = (id: string, type: string, config: Record<string, unknown>): GraphNode => ({ id, type, config, position: { x: 0, y: 0 } });

function project() {
  const p = makeProject();
  const save = makeElement('button', 'Save', { label: 'Save' });
  const title = makeElement('text', 'Title');
  p.screens[0].root.children.push(save, title);
  const details = makeScreen('Details');
  const score = makeElement('text', 'Score');
  details.root.children.push(score);
  p.screens.push(details);
  p.variables.push({ id: 'v1', name: 'points', type: 'number', initial: 0 }, { id: 'v2', name: 'unused', type: 'text', initial: '' });
  score.props.text = { kind: 'variable', variableId: 'v1' };
  details.root.props.visible = { kind: 'variable', variableId: 'v1' };
  p.graph.nodes.push(
    node('click', 'event.click', { element: save.id }),
    node('set', 'action.setText', { element: title.id }),
    node('add', 'action.changeVariable', { variable: 'v1', amount: 1 }),
    node('get', 'data.getVariable', { variable: 'v1' }),
    node('other', 'action.toast', {}),
  );
  return { p, save, title, score, details };
}

describe('where an element is used', () => {
  it('lists the blocks that point at it, by their sentences', () => {
    const { p, save, title } = project();
    expect(usesOfElement(p, save.id)).toEqual([{ kind: 'block', id: 'click', label: 'When “Save” is clicked' }]);
    expect(usesOfElement(p, title.id)).toEqual([{ kind: 'block', id: 'set', label: 'Set text of “Title”' }]);
  });

  it('is empty for an element no block uses', () => {
    const { p, score } = project();
    expect(usesOfElement(p, score.id)).toEqual([]);
  });
});

describe('where a variable is used', () => {
  it('lists blocks first, then element settings linked to it, on any screen', () => {
    const { p, score, details } = project();
    expect(usesOfVariable(p, 'v1')).toEqual([
      { kind: 'block', id: 'add', label: 'Change “points” by' },
      { kind: 'block', id: 'get', label: '“points”' },
      { kind: 'element', id: details.root.id, screenId: details.id, label: 'Screen “Details”: Visible' },
      { kind: 'element', id: score.id, screenId: details.id, label: '“Score”: Text' },
    ]);
  });

  it('is empty for a variable nothing uses', () => {
    const { p } = project();
    expect(usesOfVariable(p, 'v2')).toEqual([]);
  });
});
