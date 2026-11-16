// The guided tutorial for first-time users: building a button that says hello.
// Each step is done once the project (or the editor) shows it was carried out.

import type { Project, UIElement } from '../model/types';

/** What the steps look at. */
export interface TutorialState {
  project: Project;
  tab: 'design' | 'logic' | 'data';
  running: boolean;
  /** How many messages the running app is showing. */
  toasts: number;
}

export interface TutorialStep {
  id: string;
  title: string;
  /** What to do; `*word*` is shown in bold, as on the screen. */
  text: string;
  /** The part of the editor to point at (a CSS selector). */
  target?: string;
  /** Done once this is true; steps without it have a button to go on. */
  done?(s: TutorialState): boolean;
}

/** The default label of a new button, so a step can tell it was changed. */
export const NEW_BUTTON_LABEL = 'Click me';

function allElements(p: Project): UIElement[] {
  const out: UIElement[] = [];
  const walk = (el: UIElement) => {
    out.push(el);
    el.children.forEach(walk);
  };
  p.screens.forEach((s) => walk(s.root));
  return out;
}

const buttons = (p: Project) => allElements(p).filter((e) => e.type === 'button');

function label(el: UIElement): string {
  const pv = el.props.label;
  return pv?.kind === 'static' ? String(pv.value ?? '').trim() : '';
}

/** *When button clicked* blocks set to a button that's on a screen. */
const clickBlocks = (p: Project) => {
  const ids = new Set(buttons(p).map((b) => b.id));
  return p.graph.nodes.filter((n) => n.type === 'event.click' && ids.has(String(n.config.element ?? '')));
};

function clickWiredToMessage(p: Project): boolean {
  const clicks = new Set(clickBlocks(p).map((n) => n.id));
  const messages = new Set(p.graph.nodes.filter((n) => n.type === 'action.toast').map((n) => n.id));
  return p.graph.edges.some((e) => e.kind === 'exec' && clicks.has(e.source) && messages.has(e.target));
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: '👋 Build your first app',
    text: 'In a few short steps you’ll make an app with a button that says hello. It starts as a new project, so your other projects stay as they are, in *Projects*.',
  },
  {
    id: 'add-button',
    title: 'Add a button',
    text: 'Drag a *Button* from *Elements* onto the screen, or just click it.',
    target: '.palette-item[data-type="button"]',
    done: (s) => buttons(s.project).length > 0,
  },
  {
    id: 'label',
    title: 'Give it a label',
    text: 'Click the button on the screen. Then, in *Settings* on the right, change its *Label* to something like *Say hi*.',
    target: '.inspector',
    done: (s) => buttons(s.project).some((b) => label(b) !== '' && label(b) !== NEW_BUTTON_LABEL),
  },
  {
    id: 'logic',
    title: 'Open the Logic tab',
    text: 'Elements show things. Blocks make them do things, and they live in the *Logic* tab.',
    target: '[data-tour="logic-tab"]',
    done: (s) => s.tab === 'logic',
  },
  {
    id: 'when',
    title: 'Start with “When…”',
    text: 'Drag *When button clicked* from *Blocks* onto the graph. Then pick your button on the block.',
    target: '.node-item[data-type="event.click"]',
    done: (s) => clickBlocks(s.project).length > 0,
  },
  {
    id: 'message',
    title: 'Make it do something',
    text: 'Add a *Show message* block. Then drag from the white arrow on the right of *When button clicked* to the left of *Show message*.',
    target: '.node-item[data-type="action.toast"]',
    done: (s) => clickWiredToMessage(s.project),
  },
  {
    id: 'run',
    title: 'Try it',
    text: 'Press *▶ Run*, then click your button in the preview.',
    target: '[data-tour="run"]',
    done: (s) => s.running && s.toasts > 0 && clickWiredToMessage(s.project),
  },
  {
    id: 'finish',
    title: '🎉 You made an app!',
    text: 'That’s the whole idea: elements on screens, and blocks that make them do things. Next, try a template from *Projects*, or 🔗 *link* a Text to a variable.',
  },
];

/**
 * The step to show: from `step`, past every step that's already done, so
 * finishing one moves straight on, and the tutorial never goes backwards.
 */
export function nextStep(step: number, s: TutorialState): number {
  let i = step;
  while (i < TUTORIAL_STEPS.length - 1 && TUTORIAL_STEPS[i].done?.(s)) i++;
  return i;
}

/** Splits `*bold*` text into plain and bold parts. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*[^*]+\*)/).filter(Boolean).map((t) => (t.startsWith('*') && t.endsWith('*') && t.length > 2 ? { text: t.slice(1, -1), bold: true } : { text: t, bold: false }));
}

// Whether the tutorial was finished or turned down, so it's offered only once.
const KEY = 'cb.tutorial';
export const tutorialSeen = () => {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
};
export const markTutorialSeen = () => {
  try {
    localStorage.setItem(KEY, 'seen');
  } catch {
    // Storage may be full or turned off; the tutorial is offered again next time.
  }
};
