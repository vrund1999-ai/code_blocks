import { cloneElement, createContext, isValidElement, useContext, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { toBool, toList, toNumber, toText } from '@code-blocks/engine/convert';
import { cardValue, type CardItem } from './cards';
import { dateInputValue, dateLimits, dropdownChoices, fitDate, fitNumber, gridColumns, linkHref, numberLimits } from '../model/elements';
import { elementStyle, hasFixedWidth } from '../model/style';
import { themeStyle } from '../model/theme';
import { useProjectStore } from '../model/projectStore';
import type { UIElement } from '../model/types';
import { fireCardClick, fireChange, fireClick, fireHover, fireListDelete, isPublished } from './controller';
import { setElementState, useRuntimeStore } from './runtimeStore';

/**
 * design: editable canvas (wrappers handle selection / drag & drop)
 * static: read-only preview of the design
 * run:    the live, interactive app
 */
export type RenderMode = 'design' | 'static' | 'run';

export interface DesignHooks {
  /** `fixedWidth`: the element has a width set, so its wrapper shouldn't fill a row. */
  wrap(el: UIElement, isRoot: boolean, content: ReactNode, fixedWidth: boolean): ReactNode;
  dropIndex(containerId: string): number | null;
}

const CardContext = createContext<CardItem | null>(null);

/** Resolve an element's props: logic overrides > variable / item bindings > static values. */
function useResolvedProps(el: UIElement, mode: RenderMode, card: CardItem | null): Record<string, unknown> {
  const variables = useProjectStore((s) => s.project.variables);
  const runVars = useRuntimeStore((s) => s.vars);
  const overrides = useRuntimeStore((s) => s.elements[el.id]);
  const out: Record<string, unknown> = {};
  for (const [k, pv] of Object.entries(el.props)) {
    if (pv.kind === 'static') out[k] = pv.value;
    else if (pv.kind === 'item') out[k] = cardValue(card, pv.field);
    else if (mode === 'run') out[k] = runVars[pv.variableId];
    else out[k] = variables.find((v) => v.id === pv.variableId)?.initial;
  }
  if (mode === 'run' && overrides) Object.assign(out, overrides);
  return out;
}

const TEXT_SIZES: Record<string, CSSProperties> = {
  small: { fontSize: 13 },
  medium: { fontSize: 16 },
  large: { fontSize: 20 },
  title: { fontSize: 28 },
};

export function ElementView({
  el,
  mode,
  design,
  isRoot = false,
}: {
  el: UIElement;
  mode: RenderMode;
  design?: DesignHooks;
  isRoot?: boolean;
}) {
  const card = useContext(CardContext);
  const p = useResolvedProps(el, mode, card);
  // Lists with a *When list item clicked* block let their items be clicked.
  const cardClickable = useProjectStore((s) =>
    el.type === 'list' ? s.project.graph.nodes.some((n) => n.type === 'event.cardClick' && n.config.element === el.id) : false,
  );
  const visible = toBool(p.visible ?? true);
  if (!visible && mode !== 'design') return null;

  const run = mode === 'run';
  // Size, spacing and look settings shared by every element.
  const box = elementStyle(p, isRoot);
  let content: ReactNode;

  switch (el.type) {
    case 'container': {
      const grid = p.direction === 'grid';
      // A grid fills its rows left to right, so it places and drops like a row.
      const row = p.direction === 'row' || grid;
      const align = String(p.align ?? 'stretch');
      const style: CSSProperties = {
        ...(grid
          ? {
              display: 'grid',
              gridTemplateColumns: `repeat(${gridColumns(p.columns, 2)}, minmax(0, 1fr))`,
              // In a grid, items line up within their cell, across and down.
              justifyItems: align.replace('flex-', ''),
              alignItems: align === 'stretch' ? 'stretch' : 'start',
            }
          : { flexDirection: row ? 'row' : 'column', alignItems: align }),
        gap: toNumber(p.gap),
        padding: toNumber(p.padding),
        background: toText(p.background) || undefined,
        ...box,
      };
      const drop = design?.dropIndex(el.id) ?? null;
      const kids = childViews(el, mode, design, row, drop);
      const empty = el.children.length === 0 && mode === 'design';
      content = (
        <div
          className={`el el-container ${grid ? 'cb-grid' : row ? 'cb-row' : 'cb-col'} ${p.border ? 'bordered' : ''} ${isRoot ? 'root' : ''}`}
          style={style}
        >
          {kids}
          {empty && drop === null && (
            <div className="empty-hint">{isRoot ? 'Drag elements here from the left' : 'Drop elements here'}</div>
          )}
        </div>
      );
      break;
    }
    case 'text':
      content = (
        <div
          className="el el-text"
          style={{ ...TEXT_SIZES[String(p.size)], fontWeight: p.bold ? 700 : 400, color: toText(p.color) || undefined, ...box }}
        >
          {toText(p.text) || (mode === 'design' ? <span className="placeholder">(empty text)</span> : ' ')}
        </div>
      );
      break;
    case 'button':
      content = (
        <button
          className={`el el-button ${p.variant === 'secondary' ? 'secondary' : 'primary'}`}
          style={box}
          onClick={run ? () => fireClick(el.id, card ? { item: card.item, index: card.index } : undefined) : undefined}
          tabIndex={run ? 0 : -1}
          type="button"
        >
          {toText(p.label) || 'Button'}
        </button>
      );
      break;
    case 'input':
      content = (
        <input
          className="el el-input"
          style={box}
          placeholder={toText(p.placeholder)}
          value={toText(p.value)}
          readOnly={!run}
          tabIndex={run ? 0 : -1}
          onChange={
            run
              ? (e) => {
                  setElementState(el.id, { value: e.target.value });
                  fireChange(el.id, e.target.value);
                }
              : undefined
          }
          onKeyDown={
            run
              ? (e) => {
                  // Pressing Enter in a text box clicks the next button in the same box.
                  if (e.key === 'Enter') {
                    const btn = (e.currentTarget.closest('.el-container') as HTMLElement | null)?.querySelector(
                      'button.el-button',
                    ) as HTMLButtonElement | null;
                    btn?.click();
                  }
                }
              : undefined
          }
        />
      );
      break;
    case 'checkbox':
      content = (
        <label className="el el-checkbox" style={box}>
          <input
            type="checkbox"
            checked={toBool(p.checked)}
            disabled={!run}
            onChange={
              run
                ? (e) => {
                    setElementState(el.id, { checked: e.target.checked });
                    fireChange(el.id, e.target.checked);
                  }
                : undefined
            }
          />
          <span>{toText(p.label)}</span>
        </label>
      );
      break;
    case 'dropdown': {
      const choices = dropdownChoices(p.options, toText(p.optionField));
      const value = toText(p.value);
      // A choice set by logic that isn't in the list still shows, so what you see is what blocks read.
      if (value && !choices.includes(value)) choices.unshift(value);
      content = (
        <select
          className="el el-dropdown"
          style={box}
          aria-label={el.name}
          value={value}
          disabled={!run}
          tabIndex={run ? 0 : -1}
          onChange={
            run
              ? (e) => {
                  setElementState(el.id, { value: e.target.value });
                  fireChange(el.id, e.target.value);
                }
              : undefined
          }
        >
          <option value="" disabled>
            {toText(p.placeholder) || 'Choose…'}
          </option>
          {choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      );
      break;
    }
    case 'number': {
      const limits = numberLimits(p, false);
      // Shows what was typed; blocks read it kept within the limits, and leaving the box shows that.
      const fit = () => {
        const fitted = fitNumber(p.value, limits, false);
        if (fitted !== p.value) setElementState(el.id, { value: fitted });
      };
      content = (
        <input
          className="el el-input el-number"
          style={box}
          type="number"
          aria-label={el.name}
          placeholder={toText(p.placeholder)}
          value={p.value === '' || p.value === null || p.value === undefined ? '' : toText(p.value)}
          min={limits.min}
          max={limits.max}
          step={limits.step}
          readOnly={!run}
          tabIndex={run ? 0 : -1}
          onChange={
            run
              ? (e) => {
                  const typed = e.target.value === '' ? '' : Number(e.target.value);
                  setElementState(el.id, { value: typed });
                  fireChange(el.id, fitNumber(typed, limits, false));
                }
              : undefined
          }
          onBlur={run ? fit : undefined}
        />
      );
      break;
    }
    case 'slider': {
      const limits = numberLimits(p, true);
      const value = fitNumber(p.value, limits, true) as number;
      content = (
        <div className="el el-slider" style={box}>
          <input
            type="range"
            aria-label={el.name}
            min={limits.min}
            max={limits.max}
            step={limits.step}
            value={value}
            disabled={!run}
            tabIndex={run ? 0 : -1}
            onChange={
              run
                ? (e) => {
                    const n = Number(e.target.value);
                    setElementState(el.id, { value: n });
                    fireChange(el.id, n);
                  }
                : undefined
            }
          />
          {toBool(p.showValue) && <output className="slider-value">{value}</output>}
        </div>
      );
      break;
    }
    case 'date': {
      const limits = dateLimits(p);
      const value = fitDate(p.value, limits);
      content = (
        <input
          className="el el-input el-date"
          style={box}
          type={limits.withTime ? 'datetime-local' : 'date'}
          aria-label={el.name}
          value={dateInputValue(value)}
          min={limits.min ? dateInputValue(limits.min) : undefined}
          max={limits.max ? dateInputValue(limits.max) : undefined}
          readOnly={!run}
          tabIndex={run ? 0 : -1}
          onChange={
            run
              ? (e) => {
                  const picked = fitDate(e.target.value, limits);
                  setElementState(el.id, { value: picked });
                  fireChange(el.id, picked);
                }
              : undefined
          }
        />
      );
      break;
    }
    case 'link': {
      const href = run ? linkHref(p.url) : undefined;
      // The editor's preview always opens links in a new tab, so it isn't left.
      const newTab = toBool(p.newTab) || !isPublished();
      content = (
        <a
          className={`el el-link ${run && !href ? 'no-address' : ''}`}
          style={box}
          href={href}
          target={href && newTab ? '_blank' : undefined}
          rel={href ? 'noopener noreferrer' : undefined}
          tabIndex={run && href ? 0 : -1}
        >
          {toText(p.text) || (mode === 'design' ? <span className="placeholder">(empty link)</span> : ' ')}
        </a>
      );
      break;
    }
    case 'divider': {
      const thickness = Math.max(1, toNumber(p.thickness) || 1);
      content = (
        <div
          className="el el-divider"
          role="separator"
          style={{ ['--line' as string]: `${thickness}px solid ${toText(p.color) || '#dee2e6'}`, ...box }}
        />
      );
      break;
    }
    case 'spacer': {
      const size = Math.max(0, toNumber(p.size));
      content = <div className="el el-spacer" aria-hidden="true" style={{ width: size, height: size, ...box }} />;
      break;
    }
    case 'image': {
      const src = toText(p.src);
      content = src ? (
        <img className="el el-image" src={src} alt={toText(p.alt)} style={box} draggable={false} />
      ) : (
        <div className="el el-image placeholder-box" style={box}>
          🖼 Add an image address
        </div>
      );
      break;
    }
    case 'list': {
      const items = toList(p.items);
      const row = p.cardDirection === 'row';
      // With a *When list item clicked* block, each item can be clicked, or picked with Enter or Space.
      const clickable = run && cardClickable;
      const itemProps = (item: unknown, i: number) =>
        clickable
          ? {
              tabIndex: 0,
              onClick: (e: MouseEvent<HTMLElement>) => {
                if (!fromControl(e)) fireCardClick(el.id, i + 1, item);
              },
              onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
                if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                e.preventDefault();
                fireCardClick(el.id, i + 1, item);
              },
            }
          : {};
      const rowClass = clickable ? ' clickable' : '';
      const perRow = gridColumns(p.columns, 1);
      // Cards side by side, like a gallery.
      const listClass = `el el-list ${perRow > 1 ? 'grid' : ''}`;
      const listStyle: CSSProperties = perRow > 1 ? { ...box, gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` } : box;
      const drop = design?.dropIndex(el.id) ?? null;
      const deleteButton = (item: unknown, i: number) =>
        toBool(p.showDelete) && (
          <button
            className="list-delete"
            title="Delete"
            aria-label="Delete"
            type="button"
            tabIndex={run ? 0 : -1}
            onClick={run ? () => fireListDelete(el.id, i + 1, item) : undefined}
          >
            ✕
          </button>
        );
      const cardClass = `list-card ${row ? 'cb-row' : 'cb-col'}`;

      if (mode === 'design' && (el.children.length > 0 || drop !== null)) {
        // The designer shows the card once; it repeats for every item when the app runs.
        content = (
          <div className={listClass} style={listStyle}>
            <CardContext.Provider value={{ item: items[0], index: 1, sample: true }}>
              <div className="list-row card-row">
                <div className={`${cardClass} template`}>{childViews(el, mode, design, row, drop)}</div>
                {deleteButton(items[0], 0)}
              </div>
            </CardContext.Provider>
            <div className="list-hint">↻ This card repeats for each item in the list</div>
          </div>
        );
      } else if (el.children.length > 0) {
        content = (
          <div className={listClass} style={listStyle}>
            {items.length === 0 ? (
              <div className="list-empty">{toText(p.emptyText)}</div>
            ) : (
              items.map((item, i) => (
                <CardContext.Provider key={i} value={{ item, index: i + 1, sample: false }}>
                  <div className={`list-row card-row${rowClass}`} {...itemProps(item, i)}>
                    <div className={cardClass}>{childViews(el, mode, undefined, row, null)}</div>
                    {deleteButton(item, i)}
                  </div>
                </CardContext.Provider>
              ))
            )}
          </div>
        );
      } else {
        content = (
          <div className={listClass} style={listStyle}>
            {items.length === 0 ? (
              <div className="list-empty">{toText(p.emptyText)}</div>
            ) : (
              items.map((item, i) => (
                <div className={`list-row${rowClass}`} key={i} {...itemProps(item, i)}>
                  <span>{toText(item)}</span>
                  {deleteButton(item, i)}
                </div>
              ))
            )}
            {mode === 'design' && <div className="list-hint">Drop elements here to show each item as a card</div>}
          </div>
        );
      }
      break;
    }
  }

  if (!visible) content = <div className="hidden-in-design">{content}</div>;
  // *When mouse over* blocks: the element itself reports the mouse moving onto and off it.
  if (run && isValidElement(content)) {
    const cardInfo = card && !card.sample ? { item: card.item, index: card.index } : undefined;
    content = cloneElement(content as ReactElement<{ onMouseEnter?: () => void; onMouseLeave?: () => void }>, {
      onMouseEnter: () => fireHover(el.id, 'enter', cardInfo),
      onMouseLeave: () => fireHover(el.id, 'leave', cardInfo),
    });
  }
  return <>{design ? design.wrap(el, isRoot, content, !isRoot && hasFixedWidth(p)) : content}</>;
}

/** A box's (or List card's) children, with the drop indicator where a drag would land. */
function childViews(el: UIElement, mode: RenderMode, design: DesignHooks | undefined, row: boolean, drop: number | null) {
  const bar = <div key="__drop" className={`drop-bar ${row ? 'vertical' : ''}`} />;
  const kids: ReactNode[] = [];
  el.children.forEach((c, i) => {
    if (drop === i) kids.push(bar);
    kids.push(<ElementView key={c.id} el={c} mode={mode} design={design} />);
  });
  if (drop === el.children.length) kids.push(bar);
  return kids;
}

/** Renders a whole screen of the app, plus run-mode toasts. */
export function AppView({
  screenId,
  mode,
  design,
}: {
  screenId: string;
  mode: RenderMode;
  design?: DesignHooks;
}) {
  const screen = useProjectStore((s) => s.project.screens.find((x) => x.id === screenId) ?? s.project.screens[0]);
  const toasts = useRuntimeStore((s) => s.toasts);
  const theme = useProjectStore((s) => s.project.theme);
  return (
    <div className={`app-view mode-${mode}`} style={themeStyle(theme)}>
      <ElementView el={screen.root} mode={mode} design={design} isRoot />
      {mode === 'run' && toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Was this click on a button, link or input inside a list item, rather than on the item itself? */
function fromControl(e: MouseEvent<HTMLElement>): boolean {
  const control = (e.target as Element).closest('button, a, input, select, textarea, label');
  return control !== null && e.currentTarget.contains(control);
}
