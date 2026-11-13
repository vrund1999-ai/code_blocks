// Engine types. This package must stay free of React, DOM and Node imports so
// the same interpreter can run in the editor and on a server. Its tsconfig
// leaves out the DOM and Node types to make sure of that.

import type { ElementType, GraphNode, ValueType } from './graph';

export type NodeCategory = 'events' | 'actions' | 'flow' | 'data' | 'text' | 'lists';

export interface Pin {
  id: string;
  label: string;
  kind: 'exec' | 'data';
  valueType?: ValueType;
  /** For unconnected data inputs: show an inline editor and use this default. */
  inline?: { type: 'text' | 'number' | 'boolean'; default: unknown };
}

export interface ConfigField {
  key: string;
  label: string;
  /** `fields` edits a list of named fields ({ id, name }[]), e.g. on "Make record". */
  type: 'text' | 'number' | 'boolean' | 'select' | 'element' | 'variable' | 'screen' | 'fields';
  elementTypes?: ElementType[];
  variableTypes?: ValueType[];
  options?: { value: string; label: string }[];
  default?: unknown;
}

/** A web request made by the *Fetch from API* block. */
export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** The server's answer. `text` is the raw body; the engine turns JSON into values. */
export interface HttpResponse {
  status: number;
  statusText: string;
  text: string;
}

/** Everything the engine needs from the outside world. */
export interface HostApi {
  getVar(variableId: string): unknown;
  setVar(variableId: string, value: unknown): void;
  /** Current value typed into an input / checked state of a checkbox. */
  getElementValue(elementId: string): unknown;
  setElementProp(elementId: string, prop: string, value: unknown): void;
  toast(message: string): void;
  navigate(screenId: string): void;
  storageGet(key: string): unknown;
  storageSet(key: string, value: unknown): void;
  sleep(ms: number): Promise<void>;
  /** Sends a web request. Rejects when the server can't be reached at all. */
  httpRequest(req: HttpRequest): Promise<HttpResponse>;
}

export interface NameLookup {
  element(id: unknown): string | undefined;
  variable(id: unknown): string | undefined;
  screen(id: unknown): string | undefined;
  /** Is this element inside a List's cards? */
  inList(id: unknown): boolean;
}

export interface NodeContext {
  host: HostApi;
  node: GraphNode;
  config: Record<string, unknown>;
  /** Pull the value of a data input pin (evaluating connected nodes lazily). */
  input(pinId: string): Promise<unknown>;
  /** Publish values on this node's data outputs (readable by downstream nodes). */
  setOutputs(values: Record<string, unknown>): void;
  /** Run the chain connected to one of this node's exec outputs and wait for it. */
  runBranch(pinId: string): Promise<void>;
  /** Is anything connected to this exec output? */
  hasBranch(pinId: string): boolean;
  /** Event payload that started this run. */
  payload: Record<string, unknown>;
}

export interface NodeDef {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  inputs: Pin[];
  /** Extra input pins that depend on the block's settings (one per field, for example). */
  dynamicInputs?(config: Record<string, unknown>): Pin[];
  outputs: Pin[];
  /** Extra output pins that depend on the block's settings and the project. */
  dynamicOutputs?(config: Record<string, unknown>, names: NameLookup): Pin[];
  configFields: ConfigField[];
  /** Event nodes start runs; `event` names the trigger they listen to. */
  event?: string;
  /** Plain-English summary shown on the node. */
  sentence?(config: Record<string, unknown>, names: NameLookup): string;
  /** Return a friendly message if the node is not set up correctly. */
  validate?(config: Record<string, unknown>): string | null;
  /**
   * Action / flow nodes. Return the exec output pin to continue with
   * (default 'next'), or null to stop.
   */
  execute?(ctx: NodeContext): Promise<string | null | void> | string | null | void;
  /** Pure data nodes: compute output values from inputs. */
  evaluate?(ctx: NodeContext): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export class GraphError extends Error {
  constructor(
    public nodeId: string,
    message: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

// Shared pin helpers
export const execIn: Pin = { id: 'in', label: '', kind: 'exec' };
export const execOut: Pin = { id: 'next', label: '', kind: 'exec' };
