// Talks to the server's row routes (apps/server/src/rowRoutes.ts). In
// development the editor's dev server forwards /api to the server.

import type { CellValue } from '@code-blocks/engine/tables';
import { call } from './api';

export { ApiError, OfflineError } from './api';

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

const rowsUrl = (projectId: string, tableId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/tables/${encodeURIComponent(tableId)}/rows`;

export const listRows = (projectId: string, tableId: string, offset = 0, limit = PAGE_SIZE) =>
  call<RowPage>(`${rowsUrl(projectId, tableId)}?limit=${limit}&offset=${offset}`);

export const addRow = (projectId: string, tableId: string, values: Record<string, CellValue> = {}) =>
  call<Row>(rowsUrl(projectId, tableId), { method: 'POST', body: JSON.stringify({ values }) });

export const updateRow = (projectId: string, tableId: string, rowId: number, values: Record<string, CellValue>) =>
  call<Row>(`${rowsUrl(projectId, tableId)}/${rowId}`, { method: 'PATCH', body: JSON.stringify({ values }) });

export const deleteRow = (projectId: string, tableId: string, rowId: number) =>
  call<{ ok: true }>(`${rowsUrl(projectId, tableId)}/${rowId}`, { method: 'DELETE' });
