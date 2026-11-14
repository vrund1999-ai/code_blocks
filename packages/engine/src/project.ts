// The project file format: what a project is, how older files are upgraded,
// and the check every project goes through before it's opened or stored.
// Shared by the editor (saved and imported projects) and the server.

import { z } from 'zod';
import type { ElementType, GraphEdge, GraphNode, LogicGraph, ValueType } from './graph';
import { COLUMN_TYPES, type DataTable } from './tables';

/**
 * The current format. Bump it when the format changes, and add a step to
 * MIGRATIONS that upgrades files from the version before.
 */
export const PROJECT_VERSION = 2;

export type PropValue =
  // `value` can be left out: JSON drops a value that's undefined.
  | { kind: 'static'; value?: unknown }
  | { kind: 'variable'; variableId: string }
  /**
   * Inside a List's card: a field of the item the card shows (`field: ''`
   * means the whole item). Elements elsewhere treat it as unset.
   */
  | { kind: 'item'; field: string };

export interface UIElement {
  id: string;
  type: ElementType;
  /** Friendly, user-editable name shown in pickers ("Name Input", "Greeting"). */
  name: string;
  props: Record<string, PropValue>;
  children: UIElement[];
}

export interface Screen {
  id: string;
  name: string;
  root: UIElement;
}

export interface Variable {
  id: string;
  name: string;
  type: Exclude<ValueType, 'any'>;
  initial: unknown;
}

export interface Project {
  id: string;
  name: string;
  version: number;
  screens: Screen[];
  variables: Variable[];
  /** Data tables: their columns. The rows live on the server. */
  tables: DataTable[];
  graph: LogicGraph;
}

export const ELEMENT_TYPES = ['container', 'text', 'button', 'input', 'image', 'checkbox', 'dropdown', 'list'] as const;
export const VARIABLE_TYPES = ['text', 'number', 'boolean', 'list', 'record'] as const;

// Fails to compile if a kind of element or variable is missing from the lists above.
type Missing<A, B> = Exclude<A, B> extends never ? true : false;
const allElementTypes: Missing<ElementType, (typeof ELEMENT_TYPES)[number]> = true;
const allVariableTypes: Missing<Variable['type'], (typeof VARIABLE_TYPES)[number]> = true;
void allElementTypes;
void allVariableTypes;

// ── Upgrading older files ──────────────────────────────────────────────────

type Json = Record<string, unknown>;

/** MIGRATIONS[n] upgrades a version n file to version n + 1. */
export const MIGRATIONS: Record<number, (p: Json) => Json> = {
  // Version 1 files saved before data tables (BE-3) have no `tables`.
  1: (p) => ({ ...p, tables: p.tables ?? [] }),
};

/**
 * A project that can't be opened. The message says why, as a sentence that
 * reads well after “This project file can’t be opened.”
 */
export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFormatError';
  }
}

export const NOT_A_PROJECT = 'It doesn’t look like a Code Blocks project.';

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Upgrades a project file to PROJECT_VERSION, one version at a time. Files
 * without a version are treated as version 1, the first format.
 */
export function migrateProject(data: unknown): Json {
  // Every project has screens and a graph; without them it's some other file.
  if (!isObject(data) || !('screens' in data) || !('graph' in data)) throw new ProjectFormatError(NOT_A_PROJECT);
  const version = data.version ?? 1;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ProjectFormatError(`Its “version” should be a whole number, not ${JSON.stringify(version)}.`);
  }
  if (version > PROJECT_VERSION) {
    throw new ProjectFormatError('It was made with a newer version of Code Blocks. Update Code Blocks to open it.');
  }
  let p = data;
  for (let v = version; v < PROJECT_VERSION; v++) p = MIGRATIONS[v](p);
  return { ...p, version: PROJECT_VERSION };
}

// ── The check ──────────────────────────────────────────────────────────────

const id = z.string().min(1);

const propValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('static'), value: z.unknown().optional() }),
  z.object({ kind: z.literal('variable'), variableId: z.string() }),
  z.object({ kind: z.literal('item'), field: z.string() }),
]);

const elementSchema = z.object({
  id,
  type: z.enum(ELEMENT_TYPES),
  name: z.string(),
  props: z.record(z.string(), propValueSchema),
  get children() {
    return z.array(elementSchema);
  },
});

const screenSchema = z.object({ id, name: z.string(), root: elementSchema });

export const variableSchema = z.object({ id, name: z.string(), type: z.enum(VARIABLE_TYPES), initial: z.unknown().default(null) });

export const tableSchema = z.object({
  id,
  name: z.string(),
  columns: z.array(z.object({ id, name: z.string(), type: z.enum(COLUMN_TYPES as ['text', 'number', 'boolean']) })),
});

const nodeSchema = z.object({
  id,
  type: id,
  // Blocks without a place or settings get the defaults, rather than being refused.
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  config: z.record(z.string(), z.unknown()).default({}),
});

const edgeSchema = z.object({
  id,
  source: id,
  sourcePin: id,
  target: id,
  targetPin: id,
  kind: z.enum(['exec', 'data']),
});

/** Ids that appear more than once, with a message for the first one. */
function duplicates(ctx: z.RefinementCtx, items: { id: string }[], path: (string | number)[], what: string) {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) ctx.addIssue({ code: 'custom', path: [...path, i, 'id'], message: `Another ${what} has the same id “${item.id}”.` });
    seen.add(item.id);
  });
}

/**
 * A logic graph. Wires to blocks that aren't there are left out, since
 * nothing can run them; they're harmless leftovers, not a broken file.
 */
export const graphSchema = z
  .object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) })
  .superRefine((g, ctx) => {
    duplicates(ctx, g.nodes, ['nodes'], 'block');
    duplicates(ctx, g.edges, ['edges'], 'wire');
  })
  .transform((g): LogicGraph => {
    const ids = new Set(g.nodes.map((n) => n.id));
    return { nodes: g.nodes, edges: g.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  });

function allElements(root: UIElement): UIElement[] {
  return [root, ...root.children.flatMap(allElements)];
}

export const projectSchema = z
  .object({
    id,
    name: z.string(),
    version: z.literal(PROJECT_VERSION),
    screens: z.array(screenSchema).min(1, 'A project needs at least one screen.'),
    variables: z.array(variableSchema),
    tables: z.array(tableSchema),
    graph: graphSchema,
  })
  .superRefine((p, ctx) => {
    duplicates(ctx, p.screens, ['screens'], 'screen');
    duplicates(ctx, p.variables, ['variables'], 'variable');
    duplicates(ctx, p.tables, ['tables'], 'table');
    const seen = new Set<string>();
    p.screens.forEach((s, i) => {
      if (s.root.type !== 'container') {
        ctx.addIssue({ code: 'custom', path: ['screens', i, 'root', 'type'], message: 'A screen’s outermost element must be a container.' });
      }
      for (const el of allElements(s.root)) {
        if (seen.has(el.id)) {
          ctx.addIssue({ code: 'custom', path: ['screens', i], message: `Two elements have the same id “${el.id}”.` });
        }
        seen.add(el.id);
      }
    });
  });

// Fails to compile if the check and the types above disagree.
const checkedIsProject: Project = {} as z.output<typeof projectSchema>;
const checkedIsGraph: { nodes: GraphNode[]; edges: GraphEdge[] } = {} as z.output<typeof graphSchema>;
void checkedIsProject;
void checkedIsGraph;

// ── Messages ───────────────────────────────────────────────────────────────

const named = (what: string, item: unknown, i: number) => {
  const name = isObject(item) && typeof item.name === 'string' && item.name.trim() ? item.name.trim() : '';
  return name ? `${what} “${name}”` : `${what} ${i + 1}`;
};

/** A path such as ['screens', 0, 'root', 'children', 2, 'type'] as “screen “Home” → element “Out””. */
function describePath(data: unknown, path: PropertyKey[]): { where: string[]; field?: string } {
  const where: string[] = [];
  let cur: unknown = data;
  let field: string | undefined;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const next = isObject(cur) || Array.isArray(cur) ? (cur as Record<PropertyKey, unknown>)[key] : undefined;
    const index = path[i + 1];
    const list = typeof index === 'number' && Array.isArray(next) ? next : undefined;
    const item = list?.[index as number];
    const words: Record<string, string> = {
      screens: 'screen',
      children: 'element',
      variables: 'variable',
      tables: 'table',
      columns: 'column',
      nodes: 'block',
      edges: 'wire',
    };
    if (typeof key === 'string' && words[key] && list) {
      where.push(key === 'nodes' || key === 'edges' ? `${words[key]} ${(index as number) + 1}` : named(words[key], item, index as number));
      cur = item;
      i++;
    } else if (key === 'root' || key === 'graph') {
      cur = next;
    } else if (key === 'props' && typeof index === 'string') {
      where.push(`setting “${index}”`);
      cur = isObject(next) ? next[index] : undefined;
      i++;
    } else {
      field = String(key);
      cur = next;
    }
  }
  return { where, field };
}

const KINDS: Record<string, string> = {
  string: 'text',
  number: 'a number',
  boolean: 'true or false',
  array: 'a list',
  object: 'a record',
};

const show = (v: unknown) => (typeof v === 'string' ? `“${v}”` : JSON.stringify(v));

const valueAt = (data: unknown, path: PropertyKey[]) =>
  path.reduce<unknown>((cur, key) => (isObject(cur) || Array.isArray(cur) ? (cur as Record<PropertyKey, unknown>)[key] : undefined), data);

function issueText(issue: z.core.$ZodIssue, value: unknown): string {
  const field = String(issue.path.at(-1) ?? '');
  switch (issue.code) {
    case 'invalid_type':
      if (issue.input === undefined) return `“${field}” is missing.`;
      return `“${field}” should be ${KINDS[issue.expected] ?? issue.expected}.`;
    case 'invalid_value':
      if (issue.input === undefined) return `“${field}” is missing.`;
      return `“${field}” is ${show(issue.input)}, which should be one of ${issue.values.map((v) => String(v)).join(', ')}.`;
    case 'invalid_union':
      return value === undefined ? `“${field}” is missing.` : `“${field}” is ${show(value)}, which Code Blocks doesn’t know.`;
    case 'too_small':
      return issue.message.startsWith('A ') ? issue.message : `“${field}” can’t be empty.`;
    default:
      return issue.message;
  }
}

/** A plain message for the first problem, and how many more there are. */
export function describeIssues(data: unknown, issues: z.core.$ZodIssue[]): string {
  const first = issues[0];
  const { where } = describePath(data, first.path);
  const place = where.length ? `In ${where.join(' → ')}: ` : '';
  const more = issues.length > 1 ? ` (and ${issues.length - 1} more problem${issues.length > 2 ? 's' : ''})` : '';
  return `${place}${issueText(first, valueAt(data, first.path))}${more}`;
}

/**
 * Upgrades and checks a project, such as a parsed project file. Throws a
 * ProjectFormatError saying why when it can't be opened.
 */
export function parseProject(data: unknown): Project {
  const upgraded = migrateProject(data);
  const result = projectSchema.safeParse(upgraded, { reportInput: true });
  if (result.success) return result.data;
  throw new ProjectFormatError(describeIssues(upgraded, result.error.issues));
}
