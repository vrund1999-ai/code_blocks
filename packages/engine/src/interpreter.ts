import type { GraphEdge, GraphNode, LogicGraph } from './graph';
import { inputPins, NODE_DEFS } from './registry';
import { GraphError, type HostApi, type NodeContext, type NodeDef } from './types';

export interface InterpreterOptions {
  /** Max exec steps for a single run before we assume an endless loop. */
  maxSteps?: number;
  /**
   * Called every time an action/flow/event node runs (for highlighting and
   * the run log). Event nodes also pass what the event carries, such as a
   * typed value.
   */
  onNodeRun?(nodeId: string, payload?: Record<string, unknown>): void;
  /** Called when a running action/flow node reads one of its inputs (for the run log). */
  onInput?(nodeId: string, pinId: string, value: unknown): void;
  /** Called with each value read through a data wire (for showing live values). */
  onValue?(edgeId: string, value: unknown): void;
  /** Called for errors in event runs. If omitted, errors are re-thrown. */
  onError?(err: GraphError): void;
  defs?: Record<string, NodeDef>;
}

interface RunState {
  steps: number;
  payload: Record<string, unknown>;
  /** Data outputs published by exec nodes (events, loops, Load…). */
  execOutputs: Map<string, Record<string, unknown>>;
}

const key = (nodeId: string, pin: string) => `${nodeId}\u0000${pin}`;

export class Interpreter {
  private nodes = new Map<string, GraphNode>();
  private execOut = new Map<string, GraphEdge[]>();
  private dataIn = new Map<string, GraphEdge>();
  private defs: Record<string, NodeDef>;
  private maxSteps: number;

  constructor(
    graph: LogicGraph,
    private host: HostApi,
    private opts: InterpreterOptions = {},
  ) {
    this.defs = opts.defs ?? NODE_DEFS;
    this.maxSteps = opts.maxSteps ?? 5000;
    for (const n of graph.nodes) this.nodes.set(n.id, n);
    for (const e of graph.edges) {
      if (!this.nodes.has(e.source) || !this.nodes.has(e.target)) continue;
      if (e.kind === 'exec') {
        const k = key(e.source, e.sourcePin);
        const list = this.execOut.get(k) ?? [];
        list.push(e);
        this.execOut.set(k, list);
      } else {
        this.dataIn.set(key(e.target, e.targetPin), e);
      }
    }
    // Run connected chains top-to-bottom when one output fans out to several nodes.
    for (const list of this.execOut.values()) {
      list.sort((a, b) => (this.nodes.get(a.target)!.position.y - this.nodes.get(b.target)!.position.y));
    }
  }

  /** All event nodes listening to `event` whose config passes `match`. */
  eventNodes(event: string, match: (config: Record<string, unknown>) => boolean = () => true) {
    return [...this.nodes.values()].filter((n) => {
      const def = this.defs[n.type];
      return def?.event === event && match(this.configOf(n, def));
    });
  }

  /** Fire an event: runs every matching event node. */
  async trigger(
    event: string,
    match: (config: Record<string, unknown>) => boolean,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await Promise.all(this.eventNodes(event, match).map((n) => this.runEvent(n.id, payload)));
  }

  async runEvent(eventNodeId: string, payload: Record<string, unknown> = {}): Promise<void> {
    const node = this.nodes.get(eventNodeId);
    if (!node) return;
    const run: RunState = { steps: 0, payload, execOutputs: new Map() };
    try {
      await this.execNode(node, run);
    } catch (err) {
      const gErr =
        err instanceof GraphError
          ? err
          : new GraphError(node.id, `Something went wrong: ${(err as Error)?.message ?? String(err)}`);
      if (this.opts.onError) this.opts.onError(gErr);
      else throw gErr;
    }
  }

  // ---- internals -----------------------------------------------------------

  private configOf(node: GraphNode, def: NodeDef): Record<string, unknown> {
    const cfg: Record<string, unknown> = {};
    for (const f of def.configFields) if (f.default !== undefined) cfg[f.key] = f.default;
    return { ...cfg, ...node.config };
  }

  private defOf(node: GraphNode): NodeDef {
    const def = this.defs[node.type];
    if (!def) throw new GraphError(node.id, `Unknown block type “${node.type}”.`);
    return def;
  }

  private async runChain(from: GraphNode, pin: string, run: RunState): Promise<void> {
    for (const edge of this.execOut.get(key(from.id, pin)) ?? []) {
      await this.execNode(this.nodes.get(edge.target)!, run);
    }
  }

  private async execNode(node: GraphNode, run: RunState): Promise<void> {
    if (++run.steps > this.maxSteps) {
      throw new GraphError(
        node.id,
        'Your logic ran too many steps. Is there a loop that never ends?',
      );
    }
    const def = this.defOf(node);
    const config = this.configOf(node, def);
    const problem = def.validate?.(config);
    if (problem) throw new GraphError(node.id, problem);

    this.opts.onNodeRun?.(node.id, def.event ? run.payload : undefined);

    let next: string | null | void = 'next';
    if (def.event) {
      run.execOutputs.set(node.id, { ...run.payload });
    } else if (def.execute) {
      const ctx = this.makeContext(node, def, config, run, new Map(), new Set(), true);
      next = await def.execute(ctx);
      if (next === undefined) next = 'next';
    } else {
      // A pure data node wired into an exec chain: nothing to do.
      return;
    }
    if (next) await this.runChain(node, next, run);
  }

  private makeContext(
    node: GraphNode,
    def: NodeDef,
    config: Record<string, unknown>,
    run: RunState,
    cache: Map<string, Record<string, unknown>>,
    evaluating: Set<string>,
    /** Report the inputs it reads (for the blocks that run, not value blocks). */
    report = false,
  ): NodeContext {
    return {
      host: this.host,
      node,
      config,
      payload: run.payload,
      input: async (pinId) => {
        const value = await this.readInput(node, def, config, pinId, run, cache, evaluating);
        if (report) this.opts.onInput?.(node.id, pinId, value);
        return value;
      },
      setOutputs: (values) => {
        run.execOutputs.set(node.id, { ...(run.execOutputs.get(node.id) ?? {}), ...values });
      },
      runBranch: (pinId) => this.runChain(node, pinId, run),
      hasBranch: (pinId) => (this.execOut.get(key(node.id, pinId))?.length ?? 0) > 0,
    };
  }

  private async readInput(
    node: GraphNode,
    def: NodeDef,
    config: Record<string, unknown>,
    pinId: string,
    run: RunState,
    cache: Map<string, Record<string, unknown>>,
    evaluating: Set<string>,
  ): Promise<unknown> {
    const edge = this.dataIn.get(key(node.id, pinId));
    if (!edge) {
      const pin = inputPins(def, config).find((p) => p.id === pinId);
      return config[pinId] ?? pin?.inline?.default;
    }
    const value = await this.readEdge(edge, run, cache, evaluating);
    this.opts.onValue?.(edge.id, value);
    return value;
  }

  /** The value a data wire carries: its source block's output. */
  private async readEdge(
    edge: GraphEdge,
    run: RunState,
    cache: Map<string, Record<string, unknown>>,
    evaluating: Set<string>,
  ): Promise<unknown> {
    const src = this.nodes.get(edge.source)!;
    const srcDef = this.defOf(src);

    if (!srcDef.evaluate) {
      // Output of an exec node (event payload, loop item, loaded value…)
      return run.execOutputs.get(src.id)?.[edge.sourcePin];
    }

    let outputs = cache.get(src.id);
    if (!outputs) {
      if (evaluating.has(src.id)) {
        throw new GraphError(src.id, 'These value blocks are connected in a circle.');
      }
      const srcConfig = this.configOf(src, srcDef);
      const problem = srcDef.validate?.(srcConfig);
      if (problem) throw new GraphError(src.id, problem);
      evaluating.add(src.id);
      try {
        outputs = await srcDef.evaluate(
          this.makeContext(src, srcDef, srcConfig, run, cache, evaluating),
        );
      } finally {
        evaluating.delete(src.id);
      }
      cache.set(src.id, outputs);
    }
    return outputs[edge.sourcePin];
  }
}
