// Checks the bodies of run and deploy requests, which can come from anywhere.

import type { LogicGraph } from '@code-blocks/engine/graph';
import { describeIssues, graphSchema, tableSchema, variableSchema } from '@code-blocks/engine/project';
import { getNodeDef } from '@code-blocks/engine/registry';
import type { DataTable } from '@code-blocks/engine/tables';
import { z } from 'zod';
import type { ServerVariable } from './host';
import type { RunRequest } from './run';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

// The same checks as project files (packages/engine/src/project.ts). Variables
// sent to run don't need their names.
const partsSchema = z.object({
  graph: graphSchema,
  variables: z.array(variableSchema.omit({ name: true })).default([]),
  tables: z.array(tableSchema).default([]),
});

/** What the server needs of a project to run its blocks. */
export interface ProjectParts {
  graph: LogicGraph;
  variables: ServerVariable[];
  tables: DataTable[];
}

/** The graph, variables and tables of a request body, or a message saying what is wrong. */
export function parseProjectParts(body: Record<string, unknown>): ProjectParts | string {
  const { graph } = body;
  if (!isObject(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return '"graph" needs "nodes" and "edges" lists.';
  }
  const parts = { graph, variables: body.variables, tables: body.tables };
  const result = partsSchema.safeParse(parts, { reportInput: true });
  return result.success ? result.data : describeIssues(parts, result.error.issues);
}

/** The request, or a message saying what is wrong with it. */
export function parseRunRequest(body: unknown): RunRequest | string {
  if (!isObject(body)) return 'Send a JSON object.';
  const parts = parseProjectParts(body);
  if (isString(parts)) return parts;

  if (!isString(body.nodeId)) return '"nodeId" must name the event block to run.';
  const start = parts.graph.nodes.find((n) => n.id === body.nodeId);
  if (!start) return `There is no block "${body.nodeId}" in the graph.`;
  if (!getNodeDef(start.type)?.event) return `Block "${body.nodeId}" is not an event block, so it can't start a run.`;

  if (body.payload !== undefined && !isObject(body.payload)) return '"payload" must be an object.';
  if (body.projectId !== undefined && !isString(body.projectId)) return '"projectId" must be text.';
  if (body.replies !== undefined && typeof body.replies !== 'boolean') return '"replies" must be true or false.';

  return {
    ...parts,
    nodeId: body.nodeId,
    payload: (body.payload as Record<string, unknown>) ?? {},
    projectId: (body.projectId as string) ?? 'default',
    ...(body.replies ? { replies: true } : {}),
  };
}

/** A project sent to be deployed: its parts, its name, and the editor's fingerprint of it. */
export interface DeployRequest extends ProjectParts {
  name: string;
  fingerprint: string;
}

export function parseDeployRequest(body: unknown): DeployRequest | string {
  if (!isObject(body)) return 'Send a JSON object.';
  const parts = parseProjectParts(body);
  if (isString(parts)) return parts;
  if (body.name !== undefined && !isString(body.name)) return '"name" must be text.';
  if (body.fingerprint !== undefined && !isString(body.fingerprint)) return '"fingerprint" must be text.';
  return {
    ...parts,
    name: ((body.name as string) ?? '').slice(0, 200),
    fingerprint: ((body.fingerprint as string) ?? '').slice(0, 100),
  };
}
