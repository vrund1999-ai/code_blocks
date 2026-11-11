import { recordFields, type RecordField } from '../engine/nodes/records';
import type { ConfigField } from '../engine/types';
import { newId, nextName } from '../model/factory';
import { useProjectStore } from '../model/projectStore';
import { allElements } from '../model/tree';
import { ELEMENT_DEFS } from '../model/elements';
import { useMemo } from 'react';

/** Editor for one block setting (element / variable / screen pickers, text, numbers…). */
export function ConfigFieldInput({
  field,
  value,
  onChange,
  compact = false,
}: {
  field: ConfigField;
  value: unknown;
  onChange(v: unknown): void;
  compact?: boolean;
}) {
  const project = useProjectStore((s) => s.project);
  const cls = `field-input ${compact ? 'nodrag nowheel compact' : ''}`;

  const elements = useMemo(
    () => (field.type === 'element' ? allElements(project) : []),
    [field.type, project],
  );

  switch (field.type) {
    case 'fields':
      return <FieldListInput compact={compact} value={recordFields({ fields: value })} onChange={onChange} />;
    case 'element': {
      const opts = elements.filter((e) => !field.elementTypes || field.elementTypes.includes(e.type));
      const multiScreen = project.screens.length > 1;
      return (
        <select className={cls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{opts.length ? 'Pick…' : `(add a ${field.elementTypes?.map((t) => ELEMENT_DEFS[t].label).join(' / ') ?? 'element'} first)`}</option>
          {opts.map((e) => (
            <option key={e.id} value={e.id}>
              {ELEMENT_DEFS[e.type].icon} {e.name}
              {multiScreen ? ` (${e.screenName})` : ''}
            </option>
          ))}
        </select>
      );
    }
    case 'variable': {
      const opts = project.variables.filter((v) => !field.variableTypes || field.variableTypes.includes(v.type));
      return (
        <select className={cls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{opts.length ? 'Pick…' : '(create a variable first)'}</option>
          {opts.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      );
    }
    case 'screen':
      return (
        <select className={cls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Pick…</option>
          {project.screens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      );
    case 'select':
      return (
        <select className={cls} value={String(value ?? field.default ?? '')} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          className={cls}
          checked={Boolean(value ?? field.default)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          className={cls}
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    default:
      return (
        <input
          type="text"
          className={cls}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** Edits the named fields of a record: rename, remove, add. */
function FieldListInput({
  value,
  onChange,
  compact,
}: {
  value: RecordField[];
  onChange(v: RecordField[]): void;
  compact: boolean;
}) {
  const cls = `field-input ${compact ? 'nodrag nowheel compact' : ''}`;
  const btn = `icon-btn ${compact ? 'nodrag' : ''}`;
  return (
    <div className="field-list">
      {value.map((f, i) => (
        <div className="field-list-row" key={f.id}>
          <input
            className={cls}
            aria-label={`Field ${i + 1} name`}
            value={f.name}
            placeholder="field name"
            onChange={(e) => onChange(value.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))}
          />
          <button
            type="button"
            className={btn}
            title={`Remove field “${f.name}”`}
            aria-label={`Remove field “${f.name}”`}
            onClick={() => onChange(value.filter((x) => x.id !== f.id))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className={`chip ${compact ? 'nodrag' : ''}`}
        onClick={() => onChange([...value, { id: newId(), name: nextName(value.map((x) => x.name), 'field') }])}
      >
        + Add field
      </button>
    </div>
  );
}

/** Inline value editor for an unconnected data input on a block. */
export function InlineValueInput({
  type,
  value,
  onChange,
}: {
  type: 'text' | 'number' | 'boolean';
  value: unknown;
  onChange(v: unknown): void;
}) {
  if (type === 'boolean') {
    return (
      <select
        className="field-input nodrag nowheel compact inline"
        value={value ? 'true' : 'false'}
        onChange={(e) => onChange(e.target.value === 'true')}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  return (
    <input
      className="field-input nodrag nowheel compact inline"
      type={type === 'number' ? 'number' : 'text'}
      value={value === undefined || value === null ? '' : String(value)}
      placeholder={type === 'number' ? '0' : 'text…'}
      onChange={(e) =>
        onChange(type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value)
      }
    />
  );
}
