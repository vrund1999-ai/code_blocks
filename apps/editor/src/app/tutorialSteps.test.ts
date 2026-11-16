import { describe, expect, it } from 'vitest';
import { makeElement, makeProject } from '../model/factory';
import type { GraphNode, Project } from '../model/types';
import { boldParts, NEW_BUTTON_LABEL, nextStep, TUTORIAL_STEPS, type TutorialState } from './tutorialSteps';

const step = (id: string) => TUTORIAL_STEPS.findIndex((s) => s.id === id);
const state = (project: Project, more: Partial<TutorialState> = {}): TutorialState => ({
  project,
  tab: 'design',
  running: false,
  toasts: 0,
  ...more,
});

/** A project at each point of the tutorial. */
function build() {
  const p = makeProject('My first app');
  const button = makeElement('button', 'Button 1');
  const node = (id: string, type: string, config: Record<string, unknown> = {}): GraphNode => {
    const n = { id, type, config, position: { x: 0, y: 0 } };
    p.graph.nodes.push(n);
    return n;
  };
  return {
    p,
    button,
    addButton: () => p.screens[0].root.children.push(button),
    label: (text: string) => (button.props.label = { kind: 'static', value: text }),
    click: (element = button.id) => node('click', 'event.click', { element }),
    message: () => node('say', 'action.toast'),
    wire: (source = 'click', target = 'say') =>
      p.graph.edges.push({ id: 'e1', source, sourcePin: 'next', target, targetPin: 'in', kind: 'exec' }),
  };
}

describe('the tutorial', () => {
  it('starts with a welcome and ends with a finish, which wait for a button', () => {
    expect(TUTORIAL_STEPS[0].done).toBeUndefined();
    expect(TUTORIAL_STEPS.at(-1)!.done).toBeUndefined();
    expect(new Set(TUTORIAL_STEPS.map((s) => s.id)).size).toBe(TUTORIAL_STEPS.length);
  });

  it('moves on as each step is done', () => {
    const b = build();
    let at = nextStep(step('add-button'), state(b.p));
    expect(at).toBe(step('add-button'));

    b.addButton();
    at = nextStep(at, state(b.p));
    expect(at).toBe(step('label'));
    // A new button's own label doesn't count, and nor does an empty one.
    expect(b.button.props.label).toEqual({ kind: 'static', value: NEW_BUTTON_LABEL });
    b.label('  ');
    expect(nextStep(at, state(b.p))).toBe(step('label'));
    b.label('Say hi');
    at = nextStep(at, state(b.p));
    expect(at).toBe(step('logic'));

    at = nextStep(at, state(b.p, { tab: 'logic' }));
    expect(at).toBe(step('when'));
    // A When button clicked block has to listen to a button that's there.
    b.click('gone');
    expect(nextStep(at, state(b.p, { tab: 'logic' }))).toBe(step('when'));
    b.p.graph.nodes = [];
    b.click();
    at = nextStep(at, state(b.p, { tab: 'logic' }));
    expect(at).toBe(step('message'));

    b.message();
    expect(nextStep(at, state(b.p, { tab: 'logic' }))).toBe(step('message'));
    b.wire();
    at = nextStep(at, state(b.p, { tab: 'logic' }));
    expect(at).toBe(step('run'));

    // Running isn't enough: the message has to show.
    expect(nextStep(at, state(b.p, { running: true }))).toBe(step('run'));
    at = nextStep(at, state(b.p, { running: true, toasts: 1 }));
    expect(at).toBe(step('finish'));
    expect(nextStep(at, state(b.p, { running: true, toasts: 1 }))).toBe(step('finish'));
  });

  it('skips steps already done, and never goes back', () => {
    const b = build();
    b.addButton();
    b.label('Hello');
    // Straight past the button and its label.
    expect(nextStep(step('add-button'), state(b.p))).toBe(step('logic'));
    // Going back to the Design tab doesn't undo the Logic step.
    expect(nextStep(step('when'), state(b.p, { tab: 'design' }))).toBe(step('when'));
  });

  it('only counts an arrow from When button clicked into Show message', () => {
    const b = build();
    b.addButton();
    b.label('Hi');
    b.click();
    b.message();
    b.wire('say', 'click');
    expect(nextStep(step('message'), state(b.p))).toBe(step('message'));
  });

  it('shows *words* in bold', () => {
    expect(boldParts('Drag a *Button* onto the *screen*.')).toEqual([
      { text: 'Drag a ', bold: false },
      { text: 'Button', bold: true },
      { text: ' onto the ', bold: false },
      { text: 'screen', bold: true },
      { text: '.', bold: false },
    ]);
    expect(boldParts('No stars')).toEqual([{ text: 'No stars', bold: false }]);
  });
});
