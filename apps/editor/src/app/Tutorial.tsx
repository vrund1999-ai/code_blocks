import { useEffect } from 'react';
import { create } from 'zustand';
import { openInEditor } from '../data/projectSync';
import { makeProject } from '../model/factory';
import { useProjectStore } from '../model/projectStore';
import { stopApp } from '../runtime/controller';
import { useRuntimeStore } from '../runtime/runtimeStore';
import { boldParts, markTutorialSeen, nextStep, TUTORIAL_STEPS, tutorialSeen } from './tutorialSteps';

/** The step being shown, or null when the tutorial is closed. */
export const useTutorialStore = create<{ step: number | null }>(() => ({ step: null }));

/** Opens the tutorial at its first step (from the Projects menu, or on a first visit). */
export function openTutorial() {
  useTutorialStore.setState({ step: 0 });
}

/** On the first visit, the tutorial offers itself once. */
export function offerTutorialOnce() {
  if (!tutorialSeen()) openTutorial();
}

function closeTutorial() {
  markTutorialSeen();
  useTutorialStore.setState({ step: null });
}

/** Starts building: a new, empty project, on the Design tab. */
function begin() {
  markTutorialSeen();
  stopApp();
  openInEditor(makeProject('My first app'), {});
  useProjectStore.getState().setTab('design');
  useTutorialStore.setState({ step: 1 });
}

/** Points at a part of the editor while its step is shown. */
function usePointAt(selector: string | undefined) {
  // Re-found on every change, since the part may only appear later (the Logic tab's blocks).
  const project = useProjectStore((s) => s.project);
  const tab = useProjectStore((s) => s.tab);
  useEffect(() => {
    if (!selector) return;
    let el: Element | null = null;
    const mark = () => {
      const found = document.querySelector(selector);
      if (found === el) return;
      el?.classList.remove('tour-target');
      el = found;
      el?.classList.add('tour-target');
    };
    mark();
    // The Logic tab loads on its own, so look again for a moment.
    const timer = setInterval(mark, 300);
    return () => {
      clearInterval(timer);
      el?.classList.remove('tour-target');
    };
  }, [selector, project, tab]);
}

/** A small card in the corner that walks through building a first app. */
export function Tutorial() {
  const step = useTutorialStore((s) => s.step);
  const project = useProjectStore((s) => s.project);
  const tab = useProjectStore((s) => s.tab);
  const running = useRuntimeStore((s) => s.running);
  const toasts = useRuntimeStore((s) => s.toasts.length);

  // Each step moves on by itself once it's been done.
  useEffect(() => {
    if (step === null || step === 0) return;
    const next = nextStep(step, { project, tab, running, toasts });
    if (next !== step) useTutorialStore.setState({ step: next });
  }, [step, project, tab, running, toasts]);

  const current = step === null ? undefined : TUTORIAL_STEPS[step];
  usePointAt(current?.target);
  if (step === null || !current) return null;

  const last = step === TUTORIAL_STEPS.length - 1;
  // The steps between the welcome and the end are the ones to count.
  const total = TUTORIAL_STEPS.length - 2;
  return (
    <section className="tutorial" role="dialog" aria-labelledby="tutorial-title" aria-live="polite">
      <div className="tutorial-head">
        {step > 0 && !last && (
          <span className="hint">
            Step {step} of {total}
          </span>
        )}
        <button type="button" className="tutorial-close" aria-label="Close the tutorial" title="Close the tutorial" onClick={closeTutorial}>
          ✕
        </button>
      </div>
      <h2 id="tutorial-title">{current.title}</h2>
      <p>
        {boldParts(current.text).map((part, i) => (part.bold ? <b key={i}>{part.text}</b> : <span key={i}>{part.text}</span>))}
      </p>
      {step === 0 && (
        <div className="tutorial-actions">
          <button type="button" className="btn primary" onClick={begin}>
            Let’s go
          </button>
          <button type="button" className="btn" onClick={closeTutorial}>
            No thanks
          </button>
        </div>
      )}
      {last && (
        <div className="tutorial-actions">
          <button type="button" className="btn primary" onClick={closeTutorial}>
            Finish
          </button>
        </div>
      )}
      {step === 0 && (
        <p className="hint">
          You can start it again any time from <b>Projects</b>.
        </p>
      )}
    </section>
  );
}
