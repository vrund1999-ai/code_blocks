// The Data tab: design the app's data tables (their columns), like the
// header row of a simple spreadsheet.

import { useState } from 'react';
import { cellValue, COLUMN_TYPES, columnProblem, tableProblem, type CellValue } from '@code-blocks/engine/tables';
import { useTableRows, type TableRows } from '../data/useTableRows';
import type { Row } from '../data/rowsApi';
import { useProjectStore } from '../model/projectStore';
import type { ColumnType, DataTable, TableColumn } from '../model/types';

export const COLUMN_LABELS: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Yes / No',
};

/** What a cell of each kind could hold, for the example row. */
const EXAMPLES: Record<ColumnType, string> = {
  text: 'Some text',
  number: '42',
  boolean: 'Yes',
};

function TablesPanel({ active, onOpen }: { active: string | null; onOpen(id: string): void }) {
  const tables = useProjectStore((s) => s.project.tables);
  const addTable = useProjectStore((s) => s.addTable);
  return (
    <div className="panel-section" role="region" aria-label="Tables">
      <h3>Tables</h3>
      <p className="hint">Lists of rows your app keeps, like a simple spreadsheet. Every row has the same columns.</p>
      {tables.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`table-item ${t.id === active ? 'active' : ''}`}
          aria-current={t.id === active ? 'true' : undefined}
          onClick={() => onOpen(t.id)}
        >
          <span className="table-item-name">▦ {t.name || 'Untitled table'}</span>
          <span className="table-item-count">
            {t.columns.length} {t.columns.length === 1 ? 'column' : 'columns'}
          </span>
        </button>
      ))}
      <button type="button" className="chip" onClick={() => onOpen(addTable())}>
        + Add table
      </button>
    </div>
  );
}

/** One cell of a row. Text and numbers save when you leave the cell or press Enter. */
function Cell({ row, column, label, onSave }: { row: Row; column: TableColumn; label: string; onSave(v: CellValue): void }) {
  const value = cellValue(column.type, row.values[column.id]);
  const shown = value === null ? '' : String(value);
  const [draft, setDraft] = useState<string | null>(null);

  if (column.type === 'boolean') {
    return (
      <td>
        <input type="checkbox" aria-label={label} checked={value === true} onChange={(e) => onSave(e.target.checked)} />
      </td>
    );
  }
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft === shown) return;
    if (column.type === 'number') onSave(draft.trim() === '' ? null : Number(draft));
    else onSave(draft);
  };
  return (
    <td>
      <input
        className="cell-input"
        type={column.type === 'number' ? 'number' : 'text'}
        aria-label={label}
        value={draft ?? shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
    </td>
  );
}

/** Deleting a row can't be undone, so it asks first, right in the row. */
function DeleteRow({ id, onDelete }: { id: number; onDelete(): void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="icon-btn" aria-label={`Delete row ${id}`} title="Delete row" onClick={() => setAsking(true)}>
        ✕
      </button>
    );
  }
  return (
    <span className="row-confirm">
      <button type="button" className="btn danger small" onClick={onDelete}>
        Delete row {id}
      </button>
      <button type="button" className="btn small" onClick={() => setAsking(false)}>
        Keep
      </button>
    </span>
  );
}

function RowsBody({ table, data }: { table: DataTable; data: TableRows }) {
  const span = table.columns.length + 2;
  if (data.status === 'ready' && data.rows.length > 0) {
    return (
      <tbody>
        {data.rows.map((row) => (
          <tr key={row.id}>
            <td className="row-id">{row.id}</td>
            {table.columns.map((col, i) => (
              <Cell
                key={col.id}
                row={row}
                column={col}
                label={`Row ${row.id} ${col.name.trim() || `column ${i + 1}`}`}
                onSave={(v) => void data.update(row.id, col.id, v)}
              />
            ))}
            <td className="row-actions">
              <DeleteRow id={row.id} onDelete={() => void data.remove(row.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    );
  }
  return (
    <tbody>
      <tr className="schema-example" title="An example row, to show what each column holds">
        <td>1</td>
        {table.columns.map((col) => (
          <td key={col.id}>{EXAMPLES[col.type]}</td>
        ))}
        <td />
      </tr>
      {data.status === 'loading' && (
        <tr>
          <td colSpan={span} className="rows-note">
            Loading rows…
          </td>
        </tr>
      )}
    </tbody>
  );
}

function RowsFooter({ data }: { data: TableRows }) {
  if (data.status === 'offline' || data.status === 'failed') {
    return (
      <div className="rows-offline" role="alert">
        <span>{data.message}</span>
        {data.status === 'offline' && (
          <span className="hint">
            Rows are kept by the server. Start it with <code>npm run dev:server</code>, then try again.
          </span>
        )}
        <button type="button" className="btn small" onClick={data.reload}>
          Try again
        </button>
      </div>
    );
  }
  if (data.status !== 'ready') return null;
  return (
    <div className="rows-footer">
      <button type="button" className="btn primary small" onClick={() => void data.add()}>
        + Add row
      </button>
      <span className="hint" aria-live="polite">
        {data.total === 0
          ? 'No rows yet. The example above shows what a row could hold.'
          : data.rows.length < data.total
            ? `Showing ${data.rows.length} of ${data.total} rows.`
            : `${data.total} ${data.total === 1 ? 'row' : 'rows'}.`}{' '}
        Rows save as you edit them, and undo doesn’t change them.
      </span>
      {data.rows.length < data.total && (
        <button type="button" className="btn small" onClick={data.loadMore}>
          Show more
        </button>
      )}
    </div>
  );
}

function TableEditor({ table }: { table: DataTable }) {
  const tables = useProjectStore((s) => s.project.tables);
  const projectId = useProjectStore((s) => s.project.id);
  const data = useTableRows(projectId, table.id);
  const { renameTable, deleteTable, addColumn, updateColumn, moveColumn, deleteColumn } = useProjectStore.getState();
  const nameProblem = tableProblem(tables, table);
  const last = table.columns.length - 1;

  return (
    <div className="table-editor">
      <div className="table-editor-head">
        <input
          className="field-input table-name"
          aria-label="Table name"
          aria-invalid={nameProblem ? true : undefined}
          value={table.name}
          onChange={(e) => renameTable(table.id, e.target.value)}
        />
        <button type="button" className="btn danger small" onClick={() => deleteTable(table.id)}>
          Delete table
        </button>
      </div>
      {nameProblem && (
        <p className="field-problem" role="alert">
          {nameProblem}
        </p>
      )}
      <p className="hint">
        Each column holds one kind of value. Every row also gets an automatic <strong>id</strong> number.
      </p>

      <div className="schema-scroll">
        <table className="schema-grid" aria-label={`Columns of ${table.name || 'this table'}`}>
          <thead>
            <tr>
              <th className="schema-id" scope="col">
                <span className="schema-id-name">id</span>
                <span className="hint">Automatic number</span>
              </th>
              {table.columns.map((col, i) => {
                const problem = columnProblem(table, col);
                const label = col.name.trim() || `column ${i + 1}`;
                return (
                  <th key={col.id} scope="col" className="schema-col">
                    <input
                      className="field-input"
                      aria-label={`Column ${i + 1} name`}
                      aria-invalid={problem ? true : undefined}
                      placeholder="Column name"
                      value={col.name}
                      onChange={(e) => updateColumn(table.id, col.id, { name: e.target.value })}
                    />
                    <select
                      className="field-input"
                      aria-label={`Column ${i + 1} kind`}
                      value={col.type}
                      onChange={(e) => updateColumn(table.id, col.id, { type: e.target.value as ColumnType })}
                    >
                      {COLUMN_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {COLUMN_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <div className="schema-col-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Move “${label}” left`}
                        title="Move left"
                        disabled={i === 0}
                        onClick={() => moveColumn(table.id, col.id, -1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Move “${label}” right`}
                        title="Move right"
                        disabled={i === last}
                        onClick={() => moveColumn(table.id, col.id, 1)}
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove column “${label}”`}
                        title="Remove column"
                        onClick={() => deleteColumn(table.id, col.id)}
                      >
                        ✕
                      </button>
                    </div>
                    {problem && (
                      <p className="field-problem" role="alert">
                        {problem}
                      </p>
                    )}
                  </th>
                );
              })}
              <th className="row-actions" aria-label="Row actions" />
            </tr>
          </thead>
          <RowsBody table={table} data={data} />
        </table>
      </div>
      <RowsFooter data={data} />
      {table.columns.length === 0 && <p className="hint">This table has no columns yet. Add one below.</p>}

      <div className="add-row" role="group" aria-label="Add a column">
        {COLUMN_TYPES.map((t) => (
          <button key={t} type="button" className="chip" onClick={() => addColumn(table.id, t)}>
            + {COLUMN_LABELS[t]} column
          </button>
        ))}
      </div>
    </div>
  );
}

export function DataView() {
  const tables = useProjectStore((s) => s.project.tables);
  const addTable = useProjectStore((s) => s.addTable);
  const [openId, setOpenId] = useState<string | null>(null);
  // Show the table picked last; after it is deleted (or undone away), the first one.
  const table = tables.find((t) => t.id === openId) ?? tables[0];

  return (
    <main className="workspace">
      <aside className="sidebar">
        <TablesPanel active={table?.id ?? null} onOpen={setOpenId} />
      </aside>
      <section className="data-area" aria-label="Table designer">
        {table ? (
          <TableEditor key={table.id} table={table} />
        ) : (
          <div className="data-empty">
            <h2>Keep your app’s data in tables</h2>
            <p className="hint">
              A table is like a spreadsheet: a list of rows, such as contacts or orders, where every row has the same
              columns. Start by adding a table and naming its columns.
            </p>
            <button type="button" className="btn primary" onClick={() => setOpenId(addTable())}>
              + Add table
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
