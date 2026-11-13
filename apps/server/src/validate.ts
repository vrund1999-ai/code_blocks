// Checks the body of a run request, which can come from anywhere.

import type { GraphEdge, GraphNode } from '@code-blocks/engine/graph';
import { getNodeDef } from '@code-blocks/engine/registry';
import { COLUMN_TYPES, type DataTable, type TableColumn } from '@code-blocks/engine/tables';
import type { ServerVariable } from './host';
import type { RunRequest } from './run';

const VARIABLE_TYPES = ['text', 'number', 'boolean', 'list', 'record'];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

function parseNode(v: unknown, i: number): GraphNode | string {
  if (!isObject(v) || !isString(v.id) || !isString(v.type)) return `graph.nodes[${i}] needs an "id" and a "type".`;
  if (v.config !== undefined && !isObject(v.config)) return `graph.nodes[${i}].config must be an object.`;
  const pos = isObject(v.position) ? v.position : {};
  return {
    id: v.id,
    type: v.type,
    config: (v.config as Record<string, unknown>) ?? {},
    position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
  };
}

function parseEdge(v: unknown, i: number): GraphEdge | string {
  if (
    !isObject(v) ||
    ![v.id, v.source, v.sourcePin, v.target, v.targetPin].every(isString) ||
    (v.kind !== 'exec' && v.kind !== 'data')
  ) {
    return `graph.edges[${i}] needs "id", "source", "sourcePin", "target", "targetPin" and a "kind" of "exec" or "data".`;
  }
  return {
    id: v.id as string,
    source: v.source as string,
    sourcePin: v.sourcePin as string,
    target: v.target as string,
    targetPin: v.targetPin as string,
    kind: v.kind,
  };
}

function parseVariable(v: unknown, i: number): ServerVariable | string {
  if (!isObject(v) || !isString(v.id) || !VARIABLE_TYPES.includes(v.type as string)) {
    return `variables[${i}] needs an "id" and a "type" of ${VARIABLE_TYPES.join(', ')}.`;
  }
  return { id: v.id, type: v.type as string, initial: v.initial ?? null };
}

function parseTable(v: unknown, i: number): DataTable | string {
  if (!isObject(v) || !isString(v.id) || !isString(v.name) || !Array.isArray(v.columns)) {
    return `tables[${i}] needs an "id", a "name" and a list of "columns".`;
  }
  const columns: TableColumn[] = [];
  for (const [j, c] of v.columns.entries()) {
    if (!isObject(c) || !isString(c.id) || !isString(c.name) || !COLUMN_TYPES.includes(c.type as TableColumn['type'])) {
      return `tables[${i}].columns[${j}] needs an "id", a "name" and a "type" of ${COLUMN_TYPES.join(', ')}.`;
    }
    columns.push({ id: c.id, name: c.name, type: c.type as TableColumn['type'] });
  }
  return { id: v.id, name: v.name, columns };
}

/** The request, or a message saying what is wrong with it. */
export function parseRunRequest(body: unknown): RunRequest | string {
  if (!isObject(body)) return 'Send a JSON object.';
  const { graph } = body;
  if (!isObject(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return '"graph" needs "nodes" and "edges" lists.';
  }
  const nodes: GraphNode[] = [];
  for (const [i, raw] of graph.nodes.entries()) {
    const node = parseNode(raw, i);
    if (isString(node)) return node;
    nodes.push(node);
  }
  const edges: GraphEdge[] = [];
  for (const [i, raw] of graph.edges.entries()) {
    const edge = parseEdge(raw, i);
    if (isString(edge)) return edge;
    edges.push(edge);
  }

  if (body.variables !== undefined && !Array.isArray(body.variables)) return '"variables" must be a list.';
  const variables: ServerVariable[] = [];
  for (const [i, raw] of ((body.variables as unknown[]) ?? []).entries()) {
    const variable = parseVariable(raw, i);
    if (isString(variable)) return variable;
    variables.push(variable);
  }

  if (body.tables !== undefined && !Array.isArray(body.tables)) return '"tables" must be a list.';
  const tables: DataTable[] = [];
  for (const [i, raw] of ((body.tables as unknown[]) ?? []).entries()) {
    const table = parseTable(raw, i);
    if (isString(table)) return table;
    tables.push(table);
  }

  if (!isString(body.nodeId)) return '"nodeId" must name the event block to run.';
  const start = nodes.find((n) => n.id === body.nodeId);
  if (!start) return `There is no block "${body.nodeId}" in the graph.`;
  if (!getNodeDef(start.type)?.event) return `Block "${body.nodeId}" is not an event block, so it can't start a run.`;

  if (body.payload !== undefined && !isObject(body.payload)) return '"payload" must be an object.';
  if (body.projectId !== undefined && !isString(body.projectId)) return '"projectId" must be text.';

  return {
    graph: { nodes, edges },
    nodeId: body.nodeId,
    payload: (body.payload as Record<string, unknown>) ?? {},
    variables,
    tables,
    projectId: (body.projectId as string) ?? 'default',
  };
}
