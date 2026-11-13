// Talks to the server's row routes (apps/server/src/rowRoutes.ts). In
// development the editor's dev server forwards /api to the server.

import type { CellValue } from '@code-blocks/engine/tables';

export interface Row {
  id: number;
  /** Cell values by column id. */
  values: Record<string, CellValue>;
}

export interface RowPage {
  rows: Row[];
  total: number;
}

/** How many rows are loaded at a time. */
export const PAGE_SIZE = 100;

/** The server can't be reached at all (rather than refusing a request). */
export class OfflineError extends Error {
  constructor() {
    super('Can’t reach the Code Blocks server, so rows can’t be loaded or saved.');
    this.name = 'OfflineError';
  }
}

const rowsUrl = (projectId: string, tableId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/tables/${encodeURIComponent(tableId)}/rows`;

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  } catch {
    throw new OfflineError();
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (res.ok && body) return body;
  // The dev server's proxy answers 5xx with no JSON when the server isn't running.
  if (!body?.error?.message) {
    if (res.status >= 500) throw new OfflineError();
    throw new Error(`The server answered with error ${res.status}.`);
  }
  throw new Error(body.error.message);
}

export const listRows = (projectId: string, tableId: string, offset = 0) =>
  call<RowPage>(`${rowsUrl(projectId, tableId)}?limit=${PAGE_SIZE}&offset=${offset}`);

export const addRow = (projectId: string, tableId: string, values: Record<string, CellValue> = {}) =>
  call<Row>(rowsUrl(projectId, tableId), { method: 'POST', body: JSON.stringify({ values }) });

export const updateRow = (projectId: string, tableId: string, rowId: number, values: Record<string, CellValue>) =>
  call<Row>(`${rowsUrl(projectId, tableId)}/${rowId}`, { method: 'PATCH', body: JSON.stringify({ values }) });

export const deleteRow = (projectId: string, tableId: string, rowId: number) =>
  call<{ ok: true }>(`${rowsUrl(projectId, tableId)}/${rowId}`, { method: 'DELETE' });
