// Server workflows: blocks that start runs on the server once the project is
// deployed (a web address is called, a form is sent from the app, or a
// schedule comes round), the *Reply* block that answers them, and the
// app-side *Send form to server* block.

import { isRecord, toNumber, toRecord, toText } from '../convert';
import { execIn, execOut, GraphError, HostError, type NodeDef } from '../types';

/** Methods a *When web address is called* block can listen to; ANY takes all of them. */
export const HOOK_METHODS = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** A web address name as it is matched: no slashes at the ends, lower case. */
export function normalizeHookPath(raw: unknown): string {
  return toText(raw ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

const HOOK_PATH = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;

export function hookMethod(config: Record<string, unknown>): (typeof HOOK_METHODS)[number] {
  const m = String(config.method ?? 'ANY').toUpperCase();
  return (HOOK_METHODS as readonly string[]).includes(m) ? (m as (typeof HOOK_METHODS)[number]) : 'ANY';
}

/** Form names are matched ignoring case and spaces at the ends. */
export const formKey = (raw: unknown) => toText(raw ?? '').trim().toLowerCase();

export type Schedule =
  | { kind: 'minutes' | 'hours'; amount: number }
  | { kind: 'day'; hour: number; minute: number };

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MAX_AMOUNT = { minutes: 1440, hours: 168 };

/** The schedule a block's settings describe, or a message saying what is wrong. */
export function scheduleOf(config: Record<string, unknown>): Schedule | string {
  const every = String(config.every ?? 'minutes');
  if (every === 'day') {
    const m = TIME.exec(toText(config.time ?? '').trim());
    if (!m) return 'Give the time as hours:minutes on a 24-hour clock, like 09:00 or 17:30.';
    return { kind: 'day', hour: Number(m[1]), minute: Number(m[2]) };
  }
  const kind = every === 'hours' ? 'hours' : 'minutes';
  const amount = toNumber(config.amount ?? 15);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT[kind]) {
    return `“How many” must be a whole number from 1 to ${MAX_AMOUNT[kind]}.`;
  }
  return { kind, amount };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function describeSchedule(s: Schedule): string {
  if (s.kind === 'day') return `Every day at ${pad(s.hour)}:${pad(s.minute)}`;
  const unit = s.kind === 'minutes' ? 'minute' : 'hour';
  return s.amount === 1 ? `Every ${unit}` : `Every ${s.amount} ${unit}s`;
}

/**
 * When a schedule next comes round after `after`, in the server's local time.
 * "Every N minutes / hours" counts from midnight, so every 15 minutes runs at
 * :00, :15, :30 and :45, and starts again at midnight each day.
 */
export function nextRunAt(s: Schedule, after: Date): Date {
  const midnight = new Date(after.getFullYear(), after.getMonth(), after.getDate());
  if (s.kind === 'day') {
    const today = new Date(after.getFullYear(), after.getMonth(), after.getDate(), s.hour, s.minute);
    return today > after ? today : new Date(after.getFullYear(), after.getMonth(), after.getDate() + 1, s.hour, s.minute);
  }
  const period = s.amount * (s.kind === 'minutes' ? 60_000 : 3_600_000);
  const next = new Date(midnight.getTime() + (Math.floor((after.getTime() - midnight.getTime()) / period) + 1) * period);
  const tomorrow = new Date(after.getFullYear(), after.getMonth(), after.getDate() + 1);
  return next < tomorrow ? next : tomorrow;
}

/** Secret names: a letter, then letters, numbers and _ (up to 64). Matched ignoring case. */
export const SECRET_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export const SECRET_NAME_PROBLEM = 'Give the secret a name made of letters, numbers and _, starting with a letter, like “WEATHER_KEY”.';

/** Secrets shorter than this are refused, so hiding them in what runs show stays sensible. */
export const MIN_SECRET_LENGTH = 4;

const ONLY_ON_SERVER = ' It runs on the server once you deploy the project (☁ Server in the toolbar), not when you press Run.';

export const serverNodes: NodeDef[] = [
  {
    type: 'server.http',
    category: 'server',
    label: 'When web address is called',
    description:
      'Runs when something calls this project’s web address, such as another website or app.' +
      ONLY_ON_SERVER +
      ' Answer with a “Reply” block.',
    event: 'http',
    inputs: [],
    outputs: [
      execOut,
      { id: 'body', label: 'Data sent', kind: 'data', valueType: 'any' },
      { id: 'query', label: 'Address values', kind: 'data', valueType: 'record' },
      { id: 'method', label: 'Method', kind: 'data', valueType: 'text' },
    ],
    configFields: [
      { key: 'path', label: 'Web address name', type: 'text', default: 'my-address' },
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        default: 'ANY',
        options: HOOK_METHODS.map((m) => ({ value: m, label: m === 'ANY' ? 'Any' : m })),
      },
    ],
    sentence: (c) => {
      const path = normalizeHookPath(c.path);
      const method = hookMethod(c);
      return `When ${method === 'ANY' ? '' : `${method} `}/${path || '…'} is called`;
    },
    validate: (c) =>
      HOOK_PATH.test(normalizeHookPath(c.path))
        ? null
        : 'Give the web address a name made of letters, numbers, - and _, like “orders” or “orders/new”.',
  },
  {
    type: 'server.form',
    category: 'server',
    label: 'When form is sent',
    description:
      'Runs when a “Send form to server” block in the app sends this form.' + ONLY_ON_SERVER + ' Answer the app with a “Reply” block.',
    event: 'form',
    inputs: [],
    outputs: [execOut, { id: 'values', label: 'Values', kind: 'data', valueType: 'record' }],
    configFields: [{ key: 'form', label: 'Form name', type: 'text', default: 'my-form' }],
    sentence: (c) => `When form “${toText(c.form ?? '').trim() || '…'}” is sent`,
    validate: (c) => (formKey(c.form) ? null : 'Give the form a name.'),
  },
  {
    type: 'server.schedule',
    category: 'server',
    label: 'On a schedule',
    description: 'Runs over and over at set times, using the server’s clock.' + ONLY_ON_SERVER,
    event: 'schedule',
    inputs: [],
    outputs: [execOut, { id: 'time', label: 'Time', kind: 'data', valueType: 'text' }],
    configFields: [
      {
        key: 'every',
        label: 'Repeat',
        type: 'select',
        default: 'minutes',
        options: [
          { value: 'minutes', label: 'Every few minutes' },
          { value: 'hours', label: 'Every few hours' },
          { value: 'day', label: 'Every day at a time' },
        ],
      },
      { key: 'amount', label: 'How many minutes / hours', type: 'number', default: 15 },
      { key: 'time', label: 'Time of day (for every day)', type: 'text', default: '09:00' },
    ],
    sentence: (c) => {
      const s = scheduleOf(c);
      return typeof s === 'string' ? 'On a schedule' : describeSchedule(s);
    },
    validate: (c) => {
      const s = scheduleOf(c);
      return typeof s === 'string' ? s : null;
    },
  },
  {
    type: 'server.reply',
    category: 'server',
    label: 'Reply',
    description:
      'Answers the web address call or form that started this workflow. Text is sent as it is; records and lists are sent as JSON. If several Reply blocks run, the last one counts.',
    inputs: [
      execIn,
      { id: 'value', label: 'Answer', kind: 'data', valueType: 'any', inline: { type: 'text', default: '' } },
      { id: 'status', label: 'Status code', kind: 'data', valueType: 'number', inline: { type: 'number', default: 200 } },
    ],
    outputs: [execOut],
    configFields: [],
    sentence: () => 'Reply',
    async execute(ctx) {
      if (!ctx.host.reply) {
        throw new GraphError(
          ctx.node.id,
          'Reply only works in a server workflow that starts with “When web address is called” or “When form is sent”.',
        );
      }
      const status = toNumber(await ctx.input('status'));
      if (!Number.isInteger(status) || status < 200 || status > 599) {
        throw new GraphError(ctx.node.id, 'The status code must be a whole number from 200 to 599, like 200 for OK.');
      }
      ctx.host.reply(await ctx.input('value'), status);
    },
  },
  {
    type: 'server.secret',
    category: 'server',
    label: 'Secret',
    description:
      'Gives the value of a secret, such as an API key, kept on the server (☁ Server → Secrets). Secrets only work in server workflows, so they never reach the app, and they are hidden as ••• in replies, messages and run details.',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', kind: 'data', valueType: 'text' }],
    configFields: [{ key: 'name', label: 'Secret name', type: 'text', default: 'MY_KEY' }],
    sentence: (c) => `Secret “${toText(c.name ?? '').trim() || '…'}”`,
    validate: (c) => (SECRET_NAME.test(toText(c.name ?? '').trim()) ? null : SECRET_NAME_PROBLEM),
    evaluate(ctx) {
      if (!ctx.host.secret) {
        throw new HostError(
          'Secrets only work in server workflows, so they never reach the app. Use this block after “When web address is called”, “When form is sent” or “On a schedule”.',
        );
      }
      const name = toText(ctx.config.name ?? '').trim();
      const value = ctx.host.secret(name);
      if (value === undefined) {
        throw new GraphError(ctx.node.id, `There’s no secret “${name}” on the server. Add it in ☁ Server → Secrets.`);
      }
      return { value };
    },
  },
  {
    type: 'server.sendForm',
    category: 'server',
    label: 'Send form to server',
    description:
      'Sends a record (for example the values typed into a form) to the “When form is sent” block with the same form name, and waits for its Reply. The project must be deployed first.',
    inputs: [execIn, { id: 'values', label: 'Values', kind: 'data', valueType: 'record' }],
    outputs: [execOut, { id: 'reply', label: 'Reply', kind: 'data', valueType: 'any' }],
    configFields: [{ key: 'form', label: 'Form name', type: 'text', default: 'my-form' }],
    sentence: (c) => `Send form “${toText(c.form ?? '').trim() || '…'}” to the server`,
    validate: (c) => (formKey(c.form) ? null : 'Give the name of the form to send.'),
    async execute(ctx) {
      if (!ctx.host.sendForm) throw new HostError('“Send form to server” only works in the app.');
      const raw = await ctx.input('values');
      const values = isRecord(raw) ? raw : toRecord(raw);
      const reply = await ctx.host.sendForm(toText(ctx.config.form).trim(), values);
      ctx.setOutputs({ reply });
    },
  },
];
