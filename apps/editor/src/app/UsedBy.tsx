import { useMemo } from 'react';
import { focusBlock } from '../logic/focus';
import { useProjectStore } from '../model/projectStore';
import { usesOfElement, usesOfVariable, type Use } from '../model/usage';

/**
 * "Where is this used?": the blocks (and, for a variable, the element
 * settings) that point at an element or variable. Each one opens where it is.
 */
export function UsedBy({ element, variable }: { element?: string; variable?: string }) {
  const project = useProjectStore((s) => s.project);
  const uses = useMemo(
    () => (element ? usesOfElement(project, element) : variable ? usesOfVariable(project, variable) : []),
    [project, element, variable],
  );

  const open = (use: Use) => {
    const { setTab, select, setActiveScreen } = useProjectStore.getState();
    if (use.kind === 'block') {
      select({ kind: 'node', id: use.id });
      setTab('logic');
      focusBlock(use.id);
    } else {
      setTab('design');
      setActiveScreen(use.screenId);
      select({ kind: 'element', id: use.id });
    }
  };

  return (
    <section className="used-by" aria-label="Used by">
      <h3>Used by</h3>
      {uses.length === 0 ? (
        <p className="hint">{variable ? 'No blocks or elements use this yet.' : 'No blocks use this yet.'}</p>
      ) : (
        <ul>
          {uses.map((use) => (
            <li key={`${use.kind}:${use.id}:${use.label}`}>
              <button type="button" className="used-by-item" onClick={() => open(use)}>
                <span aria-hidden="true">{use.kind === 'block' ? '⚡' : '🎨'}</span> <span className="used-by-label">{use.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
