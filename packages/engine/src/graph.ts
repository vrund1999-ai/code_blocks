// The logic graph as stored in a project. Plain JSON-serialisable data, shared
// by the editor and anything else that runs graphs (such as a server).

/** A record is a plain object with named fields, e.g. { name: 'Ada', age: 36 }. */
export type ValueType = 'text' | 'number' | 'boolean' | 'list' | 'record' | 'any';

/** The kinds of UI element a block can point at (used to filter element pickers). */
export type ElementType =
  | 'container'
  | 'text'
  | 'button'
  | 'input'
  | 'image'
  | 'checkbox'
  | 'dropdown'
  | 'list';

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
