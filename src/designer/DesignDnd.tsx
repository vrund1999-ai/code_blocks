import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { ELEMENT_DEFS } from '../model/elements';
import { useProjectStore } from '../model/projectStore';
import { findElement, findInProject, findParent } from '../model/tree';
import type { ElementType } from '../model/types';

export type DragData = { source: 'palette'; elementType: ElementType } | { source: 'element'; id: string };

interface DropTarget {
  parentId: string;
  index: number;
}

interface DesignDndValue {
  dropTarget: DropTarget | null;
  draggingId: string | null;
}

const Ctx = createContext<DesignDndValue>({ dropTarget: null, draggingId: null });
export const useDesignDnd = () => useContext(Ctx);

/** Prefer the innermost element under the pointer. */
const deepestUnderPointer: CollisionDetection = (args) => {
  const area = (id: string | number) => {
    const r = args.droppableRects.get(id);
    return r ? r.width * r.height : Infinity;
  };
  return pointerWithin(args).sort((a, b) => area(a.id) - area(b.id));
};

const rectOf = (id: string) => document.querySelector(`[data-el-id="${id}"]`)?.getBoundingClientRect() ?? null;

function computeTarget(overId: string, x: number, y: number, draggingId: string | null): DropTarget | null {
  const { project, activeScreenId } = useProjectStore.getState();
  const screen = project.screens.find((s) => s.id === activeScreenId);
  if (!screen) return null;
  const over = findElement(screen.root, overId);
  const rect = rectOf(overId);
  if (!over || !rect) return null;

  const parent = findParent(screen.root, overId);
  const parentRow = parent?.props.direction?.kind === 'static' && parent.props.direction.value === 'row';
  const beforeAfter = (): DropTarget | null => {
    if (!parent) return null;
    const i = parent.children.findIndex((c) => c.id === overId);
    const after = parentRow ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2;
    return { parentId: parent.id, index: after ? i + 1 : i };
  };

  let target: DropTarget | null;
  if (ELEMENT_DEFS[over.type].canHaveChildren) {
    // Near the edge of a box → place next to it; otherwise → inside it.
    const size = parentRow ? rect.width : rect.height;
    const band = Math.min(14, size * 0.2);
    const pos = parentRow ? x - rect.left : y - rect.top;
    if (parent && (pos < band || pos > size - band)) {
      target = beforeAfter();
    } else {
      const row = over.props.direction?.kind === 'static' && over.props.direction.value === 'row';
      let index = over.children.length;
      for (let i = 0; i < over.children.length; i++) {
        const r = rectOf(over.children[i].id);
        if (r && (row ? x < r.left + r.width / 2 : y < r.top + r.height / 2)) {
          index = i;
          break;
        }
      }
      target = { parentId: over.id, index };
    }
  } else {
    target = beforeAfter();
  }

  // Never drop an element inside itself.
  if (target && draggingId) {
    const dragged = findElement(screen.root, draggingId);
    if (dragged && findElement(dragged, target.parentId)) return null;
  }
  return target;
}

export function DesignDnd({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<DragData | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const draggingId = active?.source === 'element' ? active.id : null;

  const pointer = (e: DragMoveEvent | DragEndEvent) => {
    const ev = e.activatorEvent as PointerEvent;
    return { x: ev.clientX + e.delta.x, y: ev.clientY + e.delta.y };
  };

  const onDragStart = (e: DragStartEvent) => setActive(e.active.data.current as DragData);
  const onDragMove = (e: DragMoveEvent) => {
    if (!e.over) return setDropTarget(null);
    const { x, y } = pointer(e);
    setDropTarget(computeTarget(String(e.over.id), x, y, draggingId));
  };
  const onDragEnd = (e: DragEndEvent) => {
    const data = e.active.data.current as DragData | undefined;
    const target = e.over ? computeTarget(String(e.over.id), pointer(e).x, pointer(e).y, draggingId) : null;
    setActive(null);
    setDropTarget(null);
    if (!data || !target) return;
    const store = useProjectStore.getState();
    if (data.source === 'palette') store.addElement(data.elementType, target.parentId, target.index);
    else store.moveElement(data.id, target.parentId, target.index);
  };

  let overlay: ReactNode = null;
  if (active?.source === 'palette') {
    const def = ELEMENT_DEFS[active.elementType];
    overlay = (
      <div className="drag-chip">
        <span className="icon">{def.icon}</span> {def.label}
      </div>
    );
  } else if (active?.source === 'element') {
    const found = findInProject(useProjectStore.getState().project, active.id);
    if (found) overlay = <div className="drag-chip">{ELEMENT_DEFS[found.el.type].icon} {found.el.name}</div>;
  }

  return (
    <Ctx.Provider value={{ dropTarget, draggingId }}>
      <DndContext
        sensors={sensors}
        collisionDetection={deepestUnderPointer}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setDropTarget(null);
        }}
      >
        {children}
        <DragOverlay dropAnimation={null}>{overlay}</DragOverlay>
      </DndContext>
    </Ctx.Provider>
  );
}
