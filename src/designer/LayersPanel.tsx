import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { create } from 'zustand';
import { ELEMENT_DEFS } from '../model/elements';
import { useProjectStore } from '../model/projectStore';
import { ancestorIds, layerRows } from '../model/tree';

/** The element whose layer row the pointer is over, outlined on the canvas. */
export const useLayerHover = create<{ id: string | null }>(() => ({ id: null }));

const showOnCanvas = (id: string) =>
  document.querySelector(`.design-canvas [data-el-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });

/**
 * A tree outline of the open screen. Click a row to select its element, even
 * one deep inside boxes or a List's card; double-click to rename it. Arrow
 * keys move through the rows and open or close them.
 */
export function LayersPanel() {
  const screen = useProjectStore((s) => s.project.screens.find((x) => x.id === s.activeScreenId) ?? s.project.screens[0]);
  const selectedId = useProjectStore((s) => (s.selection?.kind === 'element' ? s.selection.id : null));
  const { select, renameElement } = useProjectStore.getState();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => useLayerHover.setState({ id: null }), []);

  const rows = useMemo(() => layerRows(screen.root, collapsed), [screen.root, collapsed]);

  // Open the boxes around an element selected on the canvas, and bring its row into view.
  useEffect(() => {
    if (!selectedId) return;
    const around = ancestorIds(screen.root, selectedId);
    if (around.some((id) => collapsed.has(id))) {
      setCollapsed((c) => new Set([...c].filter((id) => !around.includes(id))));
      return;
    }
    treeRef.current?.querySelector(`[data-layer-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, screen.root, collapsed]);

  const toggle = (id: string, open?: boolean) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (open ?? next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pick = (id: string) => {
    select({ kind: 'element', id });
    showOnCanvas(id);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (editing) return;
    const i = rows.findIndex((r) => r.el.id === selectedId);
    const row = rows[i];
    const focusRow = (id: string) => {
      pick(id);
      requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-layer-id="${id}"]`)?.focus());
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) focusRow(next.el.id);
    } else if (row && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const hasKids = row.el.children.length > 0;
      const open = hasKids && !collapsed.has(row.el.id);
      if (e.key === 'ArrowRight' && hasKids) {
        if (open) focusRow(row.el.children[0].id);
        else toggle(row.el.id, true);
      } else if (e.key === 'ArrowLeft') {
        if (open) toggle(row.el.id, false);
        else if (row.parentId) focusRow(row.parentId);
      }
    } else if (row && e.key === 'F2' && row.depth > 0) {
      e.preventDefault();
      setEditing(row.el.id);
    }
  };

  return (
    <div className="panel-section layers-panel">
      <h3>Layers</h3>
      <div
        ref={treeRef}
        className="layers"
        role="tree"
        aria-label="Layers"
        onKeyDown={onKeyDown}
        onPointerLeave={() => useLayerHover.setState({ id: null })}
      >
        {rows.map(({ el, depth, inCard }) => {
          const def = ELEMENT_DEFS[el.type];
          const isRoot = depth === 0;
          const hasKids = el.children.length > 0;
          const open = hasKids && !collapsed.has(el.id);
          const selected = el.id === selectedId;
          return (
            <div
              key={el.id}
              data-layer-id={el.id}
              className={['layer-row', selected && 'selected', inCard && 'in-card'].filter(Boolean).join(' ')}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={selected}
              aria-expanded={hasKids ? open : undefined}
              aria-label={isRoot ? `${screen.name} (screen)` : el.name}
              tabIndex={selected || (!selectedId && isRoot) ? 0 : -1}
              style={{ paddingLeft: 4 + depth * 14 }}
              onClick={() => pick(el.id)}
              onDoubleClick={() => !isRoot && setEditing(el.id)}
              onPointerEnter={() => useLayerHover.setState({ id: el.id })}
              title={isRoot ? 'The screen itself' : `${def.label}${inCard ? ', in each card' : ''}. Double-click to rename.`}
            >
              <span
                className="layer-toggle"
                aria-hidden
                onClick={(e) => {
                  if (!hasKids) return;
                  e.stopPropagation();
                  toggle(el.id);
                }}
              >
                {hasKids ? (open ? '▾' : '▸') : ''}
              </span>
              <span className="layer-icon" aria-hidden>
                {isRoot ? '📄' : def.icon}
              </span>
              {editing === el.id ? (
                <input
                  autoFocus
                  className="field-input layer-name-input"
                  aria-label="Element name"
                  defaultValue={el.name}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') {
                      e.currentTarget.value = el.name;
                      setEditing(null);
                    }
                  }}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (editing === el.id && name && name !== el.name) renameElement(el.id, name);
                    setEditing(null);
                  }}
                />
              ) : (
                <span className="layer-name">{isRoot ? screen.name : el.name}</span>
              )}
              {el.type === 'list' && !isRoot && <span className="layer-hint">card for each item</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
