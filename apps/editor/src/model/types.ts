// Core project data model. Everything here is plain JSON-serialisable data.

export const PROJECT_VERSION = 1;

// The logic graph's types belong to the engine, which also runs without the editor.
import type { ElementType, LogicGraph, ValueType } from '@code-blocks/engine/graph';
export type { ElementType, GraphEdge, GraphNode, LogicGraph, ValueType } from '@code-blocks/engine/graph';

export type PropValue =
  | { kind: 'static'; value: unknown }
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
  graph: LogicGraph;
}
