import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { toBool, toList, toNumber, toText } from '../engine/convert';
import { cardValue, type CardItem } from './cards';
import { dropdownChoices } from '../model/elements';
import { elementStyle, hasFixedWidth } from '../model/style';
import { useProjectStore } from '../model/projectStore';
import type { UIElement } from '../model/types';
import { fireChange, fireClick, fireListDelete } from './controller';
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
  const visible = toBool(p.visible ?? true);
  if (!visible && mode !== 'design') return null;

  const run = mode === 'run';
  // Size, spacing and look settings shared by every element.
  const box = elementStyle(p, isRoot);
  let content: ReactNode;

  switch (el.type) {
    case 'container': {
      const row = p.direction === 'row';
      const style: CSSProperties = {
        flexDirection: row ? 'row' : 'column',
        alignItems: String(p.align ?? 'stretch'),
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
          className={`el el-container ${row ? 'cb-row' : 'cb-col'} ${p.border ? 'bordered' : ''} ${isRoot ? 'root' : ''}`}
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
          <div className="el el-list" style={box}>
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
          <div className="el el-list" style={box}>
            {items.length === 0 ? (
              <div className="list-empty">{toText(p.emptyText)}</div>
            ) : (
              items.map((item, i) => (
                <CardContext.Provider key={i} value={{ item, index: i + 1, sample: false }}>
                  <div className="list-row card-row">
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
          <div className="el el-list" style={box}>
            {items.length === 0 ? (
              <div className="list-empty">{toText(p.emptyText)}</div>
            ) : (
              items.map((item, i) => (
                <div className="list-row" key={i}>
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
  return (
    <div className={`app-view mode-${mode}`}>
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
