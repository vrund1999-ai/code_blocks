// Core project data model. Everything here is plain JSON-serialisable data.
// The format itself (and its check) lives in the engine, so the server shares it.

export { PROJECT_VERSION } from '@code-blocks/engine/project';
export type { Project, PropValue, Screen, UIElement, Variable } from '@code-blocks/engine/project';
export type { ElementType, GraphEdge, GraphNode, LogicGraph, ValueType } from '@code-blocks/engine/graph';
export type { ColumnType, DataTable, TableColumn } from '@code-blocks/engine/tables';
