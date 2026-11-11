// Core project data model. Everything here is plain JSON-serialisable data.

export const PROJECT_VERSION = 1;

/** A record is a plain object with named fields, e.g. { name: 'Ada', age: 36 }. */
export type ValueType = 'text' | 'number' | 'boolean' | 'list' | 'record' | 'any';

export type ElementType =
  | 'container'
  | 'text'
  | 'button'
  | 'input'
  | 'image'
  | 'checkbox'
  | 'list';

export type PropValue =
  | { kind: 'static'; value: unknown }
  | { kind: 'variable'; variableId: string };

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

export interface GraphNode {
  id: string;
  /** Key into the node registry. */
  type: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  sourcePin: string;
  target: string;
  targetPin: string;
  kind: 'exec' | 'data';
}

export interface LogicGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Project {
  id: string;
  name: string;
  version: number;
  screens: Screen[];
  variables: Variable[];
  graph: LogicGraph;
}
