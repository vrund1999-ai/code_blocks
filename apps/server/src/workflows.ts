// Server workflows: runs the event blocks of deployed projects when a web
// address is called, a form is sent from the app, or a schedule comes round.
// Keeps a short history of runs per project for the editor to show.

import type { GraphNode } from '@code-blocks/engine/graph';
import { formKey, hookMethod, nextRunAt, normalizeHookPath, scheduleOf, describeSchedule, type Schedule } from '@code-blocks/engine/nodes/server';
import { defaultConfig, getNodeDef } from '@code-blocks/engine/registry';
import type { Deployment, DeploymentStore } from './deployments';
import type { RowStore } from './rows';
import { runGraph } from './run';
import type { SecretStore } from './secrets';
import type { KeyValueStore } from './store';
import type { DeployRequest } from './validate';

/** Runs kept in a project's history. */
export const MAX_HISTORY = 20;

/** What a deployed project answers to, for the editor to show. */
export interface DeploymentSummary {
  name: string;
  deployedAt: string;
  fingerprint: string;
  addresses: { method: string; path: string }[];
  forms: string[];
  schedules: string[];
  /** Server blocks left out because their settings have a problem. */
  problems: { nodeId: string; message: string }[];
}

export interface RunRecord {
  /** When the run started, as an ISO date. */
  at: string;
  /** What started it, such as “POST /orders”, “Form “signup”” or “Every 15 minutes”. */
  trigger: string;
  ok: boolean;
  error?: { nodeId: string; message: string };
  /** Messages from *Show a message* blocks. */
  messages: string[];
}

/** The outcome of every workflow a trigger started. */
export interface WorkflowResult {
  ok: boolean;
  error?: { nodeId: string; message: string };
  messages: string[];
  reply?: { value: unknown; status: number };
}

export interface WorkflowsOptions {
  deployments: DeploymentStore;
  store: KeyValueStore;
  rows: RowStore;
  secrets?: SecretStore;
  timeLimitMs?: number;
}

const configOf = (n: GraphNode) => {
  const def = getNodeDef(n.type);
  return def ? { ...defaultConfig(def), ...n.config } : n.config;
};

/** The deployment's blocks of one type whose settings are fine, top to bottom. */
function blocksOf(d: Deployment, type: string): { node: GraphNode; config: Record<string, unknown> }[] {
  const def = getNodeDef(type)!;
  return d.graph.nodes
    .filter((n) => n.type === type)
    .map((node) => ({ node, config: configOf(node) }))
    .filter(({ config }) => !def.validate?.(config))
    .sort((a, b) => a.node.position.y - b.node.position.y);
}

export class Workflows {
  private timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  /** Scheduled runs still going, so a slow one isn't started again on top of itself. */
  private busy = new Set<string>();
  private history = new Map<string, RunRecord[]>();
  private active = false;

  constructor(private opts: WorkflowsOptions) {}

  /** Starts the schedules of every deployed project. */
  start() {
    this.active = true;
    for (const d of this.opts.deployments.all()) this.arm(d);
  }

  /** Stops all schedules. */
  stop() {
    this.active = false;
    for (const id of [...this.timers.keys()]) this.disarm(id);
  }

  deploy(projectId: string, req: DeployRequest): DeploymentSummary {
    const d: Deployment = { ...req, projectId, deployedAt: new Date().toISOString() };
    this.opts.deployments.put(d);
    if (this.active) this.arm(d);
    return this.summarize(d);
  }

  /** False when the project wasn't deployed. */
  undeploy(projectId: string): boolean {
    this.disarm(projectId);
    return this.opts.deployments.remove(projectId);
  }

  summary(projectId: string): DeploymentSummary | undefined {
    const d = this.opts.deployments.get(projectId);
    return d && this.summarize(d);
  }

  /** The project's latest runs, newest first. */
  runs(projectId: string): RunRecord[] {
    return [...(this.history.get(projectId) ?? [])].reverse();
  }

  /** Runs the workflows answering at this web address. Null when none do. */
  async callAddress(
    projectId: string,
    method: string,
    path: string,
    payload: { body: unknown; query: Record<string, string>; method: string },
  ): Promise<WorkflowResult | null> {
    const d = this.opts.deployments.get(projectId);
    if (!d) return null;
    const want = normalizeHookPath(path);
    const blocks = blocksOf(d, 'server.http').filter(({ config }) => {
      const m = hookMethod(config);
      return normalizeHookPath(config.path) === want && (m === 'ANY' || m === method);
    });
    if (!blocks.length) return null;
    return this.runAll(d, blocks, payload, `${method} /${want}`, true);
  }

  /** Runs the workflows for this form. Null when none do. */
  async sendForm(projectId: string, form: string, values: Record<string, unknown>): Promise<WorkflowResult | null> {
    const d = this.opts.deployments.get(projectId);
    if (!d) return null;
    const blocks = blocksOf(d, 'server.form').filter(({ config }) => formKey(config.form) === formKey(form));
    if (!blocks.length) return null;
    return this.runAll(d, blocks, { values }, `Form “${form.trim()}”`, true);
  }

  // ---- internals -----------------------------------------------------------

  private async runAll(
    d: Deployment,
    blocks: { node: GraphNode }[],
    payload: Record<string, unknown>,
    trigger: string,
    replies: boolean,
  ): Promise<WorkflowResult> {
    const at = new Date().toISOString();
    const result: WorkflowResult = { ok: true, messages: [] };
    for (const { node } of blocks) {
      const run = await runGraph(
        { graph: d.graph, variables: d.variables, tables: d.tables, projectId: d.projectId, nodeId: node.id, payload },
        { store: this.opts.store, rows: this.opts.rows, secrets: this.opts.secrets, timeLimitMs: this.opts.timeLimitMs, replies },
      );
      result.messages.push(...run.messages);
      if (run.reply) result.reply = run.reply;
      if (run.error && result.ok) {
        result.ok = false;
        result.error = run.error;
      }
    }
    this.record(d.projectId, { at, trigger, ok: result.ok, ...(result.error ? { error: result.error } : {}), messages: result.messages });
    return result;
  }

  private record(projectId: string, run: RunRecord) {
    const list = this.history.get(projectId) ?? [];
    list.push(run);
    if (list.length > MAX_HISTORY) list.shift();
    this.history.set(projectId, list);
  }

  private summarize(d: Deployment): DeploymentSummary {
    const problems: DeploymentSummary['problems'] = [];
    for (const n of d.graph.nodes) {
      const def = getNodeDef(n.type);
      if (def?.category !== 'server' || !def.event) continue;
      const message = def.validate?.(configOf(n));
      if (message) problems.push({ nodeId: n.id, message });
    }
    return {
      name: d.name,
      deployedAt: d.deployedAt,
      fingerprint: d.fingerprint,
      addresses: blocksOf(d, 'server.http').map(({ config }) => ({ method: hookMethod(config), path: normalizeHookPath(config.path) })),
      forms: blocksOf(d, 'server.form').map(({ config }) => String(config.form).trim()),
      schedules: blocksOf(d, 'server.schedule').map(({ config }) => describeSchedule(scheduleOf(config) as Schedule)),
      problems,
    };
  }

  /** Sets timers for the deployment's schedules, replacing the project's earlier ones. */
  private arm(d: Deployment) {
    this.disarm(d.projectId);
    const timers: ReturnType<typeof setTimeout>[] = [];
    this.timers.set(d.projectId, timers);
    for (const { node, config } of blocksOf(d, 'server.schedule')) {
      const schedule = scheduleOf(config) as Schedule;
      const trigger = describeSchedule(schedule);
      const key = `${d.projectId}\u0000${node.id}`;
      const wait = (after: Date) => {
        const due = nextRunAt(schedule, after);
        const timer = setTimeout(() => {
          timers.splice(timers.indexOf(timer), 1);
          // Count from when it was due, in case the timer fired a moment early.
          wait(new Date(Math.max(Date.now(), due.getTime())));
          if (this.busy.has(key)) return;
          this.busy.add(key);
          void this.runAll(d, [{ node }], { time: due.toISOString() }, trigger, false).finally(() => this.busy.delete(key));
        }, due.getTime() - Date.now());
        timer.unref?.();
        timers.push(timer);
      };
      wait(new Date());
    }
  }

  private disarm(projectId: string) {
    this.timers.get(projectId)?.forEach(clearTimeout);
    this.timers.delete(projectId);
  }
}
