import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, LogicGraph } from './graph';
import { Interpreter } from './interpreter';
import { describeSchedule, nextRunAt, normalizeHookPath, scheduleOf, type Schedule } from './nodes/server';
import { getNodeDef } from './registry';
import type { GraphError, HostApi } from './types';

const at = (h: number, m: number, day = 13) => new Date(2026, 10, day, h, m);

describe('schedules', () => {
  it('reads the block’s settings, or says what is wrong', () => {
    expect(scheduleOf({ every: 'minutes', amount: 15 })).toEqual({ kind: 'minutes', amount: 15 });
    expect(scheduleOf({ every: 'hours', amount: '2' })).toEqual({ kind: 'hours', amount: 2 });
    expect(scheduleOf({ every: 'day', time: ' 9:05 ' })).toEqual({ kind: 'day', hour: 9, minute: 5 });
    expect(scheduleOf({ every: 'minutes', amount: 0 })).toMatch(/from 1 to 1440/);
    expect(scheduleOf({ every: 'hours', amount: 1.5 })).toMatch(/from 1 to 168/);
    expect(scheduleOf({ every: 'day', time: '25:00' })).toMatch(/24-hour clock/);
  });

  it('describes schedules in words', () => {
    expect(describeSchedule({ kind: 'minutes', amount: 1 })).toBe('Every minute');
    expect(describeSchedule({ kind: 'hours', amount: 3 })).toBe('Every 3 hours');
    expect(describeSchedule({ kind: 'day', hour: 7, minute: 0 })).toBe('Every day at 07:00');
  });

  it.each<[string, Schedule, Date, Date]>([
    ['every 15 minutes, mid-hour', { kind: 'minutes', amount: 15 }, at(10, 7), at(10, 15)],
    ['every 15 minutes, exactly on time', { kind: 'minutes', amount: 15 }, at(10, 15), at(10, 30)],
    ['every 5 hours restarts at midnight', { kind: 'hours', amount: 5 }, at(21, 0), at(0, 0, 14)],
    ['every day, later today', { kind: 'day', hour: 17, minute: 30 }, at(9, 0), at(17, 30)],
    ['every day, already past', { kind: 'day', hour: 9, minute: 0 }, at(9, 0), at(9, 0, 14)],
  ])('finds the next run: %s', (_, schedule, after, next) => {
    expect(nextRunAt(schedule, after)).toEqual(next);
  });
});

describe('server blocks', () => {
  it('describe themselves and check their settings', () => {
    const http = getNodeDef('server.http')!;
    const names = { element: () => undefined, variable: () => undefined, screen: () => undefined, inList: () => false };
    expect(http.sentence!({ path: '/Orders/New/', method: 'POST' }, names)).toBe('When POST /orders/new is called');
    expect(http.validate!({ path: 'orders new' })).toMatch(/letters, numbers/);
    expect(http.validate!({ path: 'orders' })).toBeNull();
    expect(normalizeHookPath(' /Sign-Up/ ')).toBe('sign-up');
    expect(getNodeDef('server.schedule')!.sentence!({ every: 'day', time: '08:15' }, names)).toBe('Every day at 08:15');
    expect(getNodeDef('server.form')!.validate!({ form: '  ' })).toBe('Give the form a name.');
  });

  let y = 0;
  const n = (id: string, type: string, config: Record<string, unknown> = {}): GraphNode => ({ id, type, config, position: { x: 0, y: y++ } });
  const ex = (s: string, t: string): GraphEdge => ({ id: `${s}-${t}`, source: s, sourcePin: 'next', target: t, targetPin: 'in', kind: 'exec' });
  const da = (s: string, sp: string, t: string, tp: string): GraphEdge => ({ id: `${s}-${sp}-${t}`, source: s, sourcePin: sp, target: t, targetPin: tp, kind: 'data' });

  function run(host: Partial<HostApi>, nodes: GraphNode[], edges: GraphEdge[], payload = {}) {
    const vars: Record<string, unknown> = {};
    const full = {
      getVar: (id: string) => vars[id],
      setVar: (id: string, v: unknown) => void (vars[id] = v),
      toast: () => {},
      ...host,
    } as HostApi;
    const errors: GraphError[] = [];
    const graph: LogicGraph = { nodes, edges };
    return new Interpreter(graph, full, { onError: (e) => errors.push(e) }).runEvent(nodes[0].id, payload).then(() => ({ vars, errors }));
  }

  it('replies with what the workflow was sent', async () => {
    const replies: [unknown, number][] = [];
    const { errors } = await run(
      { reply: (v, s) => replies.push([v, s]) },
      [n('hook', 'server.http', { path: 'echo' }), n('r', 'server.reply', { status: 201 })],
      [ex('hook', 'r'), da('hook', 'body', 'r', 'value')],
      { body: { name: 'Ada' }, query: {}, method: 'POST' },
    );
    expect(errors).toEqual([]);
    expect(replies).toEqual([[{ name: 'Ada' }, 201]]);
  });

  it('says where Reply works, and checks the status code', async () => {
    const outside = await run({}, [n('e', 'event.click', { element: 'b' }), n('r', 'server.reply')], [ex('e', 'r')]);
    expect(outside.errors[0].message).toMatch(/only works in a server workflow/);
    const bad = await run({ reply: () => {} }, [n('e', 'server.form', { form: 'f' }), n('r', 'server.reply', { status: 42 })], [ex('e', 'r')]);
    expect(bad.errors.map((e) => e.nodeId)).toEqual(['r']);
    expect(bad.errors[0].message).toMatch(/from 200 to 599/);
  });

  it('sends a form from the app and gives back the reply', async () => {
    const sent: unknown[] = [];
    const { vars, errors } = await run(
      {
        sendForm: async (form, values) => {
          sent.push([form, values]);
          return 'Thanks!';
        },
      },
      [
        n('e', 'event.click', { element: 'b' }),
        n('rec', 'data.makeRecord', { fields: [{ id: 'a', name: 'email' }], f_a: 'ada@example.com' }),
        n('send', 'server.sendForm', { form: ' Sign up ' }),
        n('set', 'action.setVariable', { variable: 'answer' }),
      ],
      [ex('e', 'send'), ex('send', 'set'), da('rec', 'value', 'send', 'values'), da('send', 'reply', 'set', 'value')],
    );
    expect(errors).toEqual([]);
    expect(sent).toEqual([['Sign up', { email: 'ada@example.com' }]]);
    expect(vars.answer).toBe('Thanks!');

    const onServer = await run({}, [n('e', 'server.schedule'), n('send', 'server.sendForm', { form: 'x' })], [ex('e', 'send')]);
    expect(onServer.errors[0]).toMatchObject({ nodeId: 'send', message: '“Send form to server” only works in the app.' });
  });
});
