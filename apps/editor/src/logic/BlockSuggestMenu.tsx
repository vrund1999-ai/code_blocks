import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CATEGORIES, suggestBlocks, type BlockSuggestion } from '@code-blocks/engine/registry';
import type { Pin } from '@code-blocks/engine/types';

export interface SuggestRequest {
  /** Where the wire was dropped, in pixels inside the logic canvas. */
  at: { x: number; y: number };
  /** The pin the wire was dragged out of. */
  pin: Pin;
  side: 'in' | 'out';
}

/**
 * The menu that opens when a wire is dropped on empty space: blocks that fit
 * the wire, grouped like the palette, with a search box. Enter adds the first
 * match; Escape or a click outside closes it.
 */
export function BlockSuggestMenu({
  request,
  onPick,
  onClose,
}: {
  request: SuggestRequest;
  onPick: (s: BlockSuggestion) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(request.at);
  const all = useMemo(() => suggestBlocks(request.pin, request.side), [request]);
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (s) => !q || s.def.label.toLowerCase().includes(q) || s.def.description.toLowerCase().includes(q),
  );

  // Keep the menu inside the canvas.
  useLayoutEffect(() => {
    const menu = ref.current;
    const box = menu?.parentElement?.getBoundingClientRect();
    if (!menu || !box) return;
    const x = Math.max(8, Math.min(request.at.x, box.width - menu.offsetWidth - 8));
    const y = Math.max(8, Math.min(request.at.y, box.height - menu.offsetHeight - 8));
    setPos({ x, y });
  }, [request]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement && shown.length) {
      e.preventDefault();
      onPick(shown[0]);
    }
  };

  const what =
    request.pin.kind === 'exec'
      ? request.side === 'out'
        ? 'what happens next'
        : 'what leads here'
      : request.side === 'out'
        ? `what to do with “${request.pin.label}”`
        : `where “${request.pin.label}” comes from`;

  return (
    <div
      ref={ref}
      className="suggest-menu"
      role="dialog"
      aria-label="Blocks that fit this wire"
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={onKeyDown}
    >
      <div className="suggest-title">Add a block: {what}</div>
      <input
        className="field-input search"
        placeholder="Search blocks…"
        aria-label="Search blocks that fit"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="suggest-list">
        {CATEGORIES.map((cat) => {
          const items = shown.filter((s) => s.def.category === cat.id);
          if (!items.length) return null;
          return (
            <div key={cat.id} className="suggest-cat" role="group" aria-label={cat.label}>
              <div className="node-cat-title" style={{ color: cat.color }}>
                {cat.label}
              </div>
              {items.map((s) => (
                <button
                  key={s.def.type}
                  className="node-item suggest-item"
                  style={{ ['--cat' as string]: cat.color }}
                  title={s.def.description}
                  onClick={() => onPick(s)}
                >
                  {s.def.label}
                  {s.fits > 1 && s.pin.label && <span className="suggest-pin"> → {s.pin.label}</span>}
                </button>
              ))}
            </div>
          );
        })}
        {shown.length === 0 && <div className="hint suggest-none">No blocks fit this wire{q && ' and your search'}.</div>}
      </div>
    </div>
  );
}
