// Loads a table's rows from the server and keeps them in step with edits.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CellValue } from '@code-blocks/engine/tables';
import { pushToast } from '../runtime/runtimeStore';
import { useAuthStore } from './authStore';
import { addRow, deleteRow, listRows, OfflineError, updateRow, type Row } from './rowsApi';

/** `signed-out`: rows are kept on the server, which needs an account. */
export type RowsStatus = 'loading' | 'ready' | 'offline' | 'failed' | 'signed-out';

export interface TableRows {
  status: RowsStatus;
  /** Why loading failed, for `offline` and `failed`. */
  message: string;
  rows: Row[];
  total: number;
  reload(): void;
  loadMore(): void;
  add(): Promise<void>;
  update(rowId: number, columnId: string, value: CellValue): Promise<void>;
  remove(rowId: number): Promise<void>;
}

export function useTableRows(projectId: string, tableId: string): TableRows {
  const [status, setStatus] = useState<RowsStatus>('loading');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  // Answers that arrive after the table or project changed are ignored.
  const current = useRef(0);

  const fail = (err: unknown) => {
    setStatus(err instanceof OfflineError ? 'offline' : 'failed');
    setMessage((err as Error).message);
  };

  const auth = useAuthStore((s) => s.status);
  const reload = useCallback(() => {
    const ticket = ++current.current;
    if (auth === 'guest') {
      setStatus('signed-out');
      setMessage('Rows are kept on the Code Blocks server. Sign in to add and see them.');
      return;
    }
    setStatus('loading');
    if (auth === 'checking') return;
    listRows(projectId, tableId).then(
      (page) => {
        if (ticket !== current.current) return;
        setRows(page.rows);
        setTotal(page.total);
        setStatus('ready');
      },
      (err) => ticket === current.current && fail(err),
    );
  }, [projectId, tableId, auth]);

  useEffect(() => {
    reload();
    return () => {
      current.current++;
    };
  }, [reload]);

  /** Runs a change; a failure is shown as a message and leaves the rows as they were. */
  const change = async (fn: () => Promise<void>) => {
    const ticket = current.current;
    try {
      await fn();
    } catch (err) {
      if (ticket !== current.current) return;
      if (err instanceof OfflineError) fail(err);
      else pushToast((err as Error).message, 'error');
    }
  };

  return {
    status,
    message,
    rows,
    total,
    reload,
    loadMore: () => {
      const ticket = current.current;
      listRows(projectId, tableId, rows.length).then(
        (page) => {
          if (ticket !== current.current) return;
          const seen = new Set(rows.map((r) => r.id));
          setRows((rs) => [...rs, ...page.rows.filter((r) => !seen.has(r.id))]);
          setTotal(page.total);
        },
        (err) => ticket === current.current && fail(err),
      );
    },
    add: () =>
      change(async () => {
        const row = await addRow(projectId, tableId);
        setRows((rs) => [...rs, row]);
        setTotal((n) => n + 1);
      }),
    update: (rowId, columnId, value) => {
      // Show the new value straight away, and put the old one back if saving fails.
      const before = rows.find((r) => r.id === rowId)?.values[columnId] ?? null;
      const setCell = (v: CellValue) =>
        setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [columnId]: v } } : r)));
      setCell(value);
      return change(async () => {
        try {
          await updateRow(projectId, tableId, rowId, { [columnId]: value });
        } catch (err) {
          setCell(before);
          throw err;
        }
      });
    },
    remove: (rowId) =>
      change(async () => {
        await deleteRow(projectId, tableId, rowId);
        setRows((rs) => rs.filter((r) => r.id !== rowId));
        setTotal((n) => n - 1);
      }),
  };
}
