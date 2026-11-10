import { useDraggable } from '@dnd-kit/core';
import { ELEMENT_DEFS, ELEMENT_ORDER } from '../model/elements';
import { useProjectStore } from '../model/projectStore';
import { findInProject, findParent } from '../model/tree';
import type { ElementType } from '../model/types';
import type { DragData } from './DesignDnd';

function PaletteItem({ type }: { type: ElementType }) {
  const def = ELEMENT_DEFS[type];
  const { setNodeRef, listeners, attributes } = useDraggable({
    id: `palette:${type}`,
    data: { source: 'palette', elementType: type } satisfies DragData,
  });

  /** Clicking adds the element into the selected box (or next to the selected element). */
  const addByClick = () => {
    const { project, selection, activeScreenId, addElement } = useProjectStore.getState();
    const screen = project.screens.find((s) => s.id === activeScreenId)!;
    let parentId = screen.root.id;
    let index: number | undefined;
    if (selection?.kind === 'element') {
      const found = findInProject(project, selection.id);
      if (found && found.screen.id === screen.id) {
        if (ELEMENT_DEFS[found.el.type].canHaveChildren) parentId = found.el.id;
        else {
          const parent = findParent(screen.root, found.el.id);
          if (parent) {
            parentId = parent.id;
            index = parent.children.findIndex((c) => c.id === found.el.id) + 1;
          }
        }
      }
    }
    addElement(type, parentId, index);
  };

  return (
    <button
      ref={setNodeRef}
      className="palette-item"
      title={`${def.description}\nDrag onto the screen, or click to add.`}
      onClick={addByClick}
      {...listeners}
      {...attributes}
    >
      <span className="icon">{def.icon}</span>
      <span>{def.label}</span>
    </button>
  );
}

export function ComponentPalette() {
  return (
    <div className="panel-section">
      <h3>Elements</h3>
      <p className="hint">Drag onto your screen, or click to add.</p>
      <div className="palette-grid">
        {ELEMENT_ORDER.map((t) => (
          <PaletteItem key={t} type={t} />
        ))}
      </div>
    </div>
  );
}
