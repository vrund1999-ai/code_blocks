import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANGES_SCREEN, NAVIGATES, READS_SCREEN } from './host';
import { MAX_STEPS_LOGGED, runGraph, type RunRequest } from './run';
import { MemoryStore } from './store';
import { data, exec, node } from './testGraph';

const request = (over: Partial<RunRequest>): RunRequest => ({
  graph: { nodes: [], edges: [] },
  nodeId: 'start',
  payload: {},
  variables: [],
  projectId: 'p1',
  ...over,
});

const store = () => new MemoryStore();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runGraph', () => {
  it('runs a chain and reports steps, variables and messages', async () => {
    const result = await runGraph(
      request({
        graph: {
          nodes: [
            node('start', 'event.screenLoad', { screen: 's' }),
            node('add', 'action.changeVariable', { variable: 'count', amount: 2 }),
            node('get', 'data.getVariable', { variable: 'count' }),
            node('msg', 'action.toast'),
          ],
          edges: [exec('start', 'add'), exec('add', 'msg'), data('get', 'value', 'msg', 'message')],
        },
        variables: [{ id: 'count', type: 'number', initial: 1 }],
      }),
      { store: store() },
    );
    expect(result).toEqual({
      ok: true,
      steps: [
        { nodeId: 'start', payload: {}, inputs: {} },
        { nodeId: 'add', inputs: { amount: 2 } },
        { nodeId: 'msg', inputs: { message: 3 } },
      ],
      dropped: 0,
      vars: { count: 3 },
      messages: ['3'],
    });
  });

  it('passes what the event carries and converts variables to their type', async () => {
    const result = await runGraph(
      request({
        graph: {
          nodes: [
            node('start', 'event.inputChange', { element: 'age' }),
            node('set', 'action.setVariable', { variable: 'age' }),
          ],
          edges: [exec('start', 'set'), data('start', 'value', 'set', 'value')],
        },
        payload: { value: '42' },
        variables: [{ id: 'age', type: 'number', initial: 0 }],
      }),
      { store: store() },
    );
    expect(result.ok).toBe(true);
    expect(result.vars).toEqual({ age: 42 });
    expect(result.steps[0]).toEqual({ nodeId: 'start', payload: { value: '42' }, inputs: {} });
  });

  it('stops screen blocks with a friendly message on the block', async () => {
    const run = (type: string, config: Record<string, unknown>) =>
      runGraph(
        request({
          graph: {
            nodes: [node('start', 'event.screenLoad', { screen: 's' }), node('b', type, config)],
            edges: [exec('start', 'b')],
          },
        }),
        { store: store() },
      );
    expect((await run('action.setText', { element: 'title' })).error).toEqual({ nodeId: 'b', message: CHANGES_SCREEN });
    expect((await run('action.goToScreen', { screen: 's2' })).error).toEqual({ nodeId: 'b', message: NAVIGATES });

    const read = await runGraph(
      request({
        graph: {
          nodes: [
            node('start', 'event.screenLoad', { screen: 's' }),
            node('read', 'data.getInputValue', { element: 'name' }),
            node('msg', 'action.toast'),
          ],
          edges: [exec('start', 'msg'), data('read', 'value', 'msg', 'message')],
        },
      }),
      { store: store() },
    );
    expect(read).toMatchObject({ ok: false, error: { nodeId: 'read', message: READS_SCREEN }, messages: [] });
  });

  it('keeps saved values between runs, apart per project', async () => {
    const shared = store();
    const save = request({
      graph: {
        nodes: [node('start', 'event.screenLoad', { screen: 's' }), node('save', 'action.saveStorage', { key: 'k', value: 'hi' })],
        edges: [exec('start', 'save')],
      },
    });
    const load = (projectId: string) =>
      runGraph(
        request({
          projectId,
          graph: {
            nodes: [
              node('start', 'event.screenLoad', { screen: 's' }),
              node('load', 'action.loadStorage', { key: 'k' }),
              node('msg', 'action.toast'),
            ],
            edges: [exec('start', 'load'), exec('load', 'msg'), data('load', 'found', 'msg', 'message')],
          },
        }),
        { store: shared },
      );
    await runGraph(save, { store: shared });
    expect((await load('p1')).messages).toEqual(['true']);
    expect((await load('p2')).messages).toEqual(['false']);
  });

  it('stops a run that takes too long, at the block that was waiting', async () => {
    const result = await runGraph(
      request({
        graph: {
          nodes: [
            node('start', 'event.screenLoad', { screen: 's' }),
            node('wait', 'action.wait', { seconds: 60 }),
            node('msg', 'action.toast'),
          ],
          edges: [exec('start', 'wait'), exec('wait', 'msg')],
        },
      }),
      { store: store(), timeLimitMs: 50 },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { nodeId: 'wait', message: 'The server stopped this run because it took longer than 0.05 seconds.' },
      messages: [],
    });
  });

  it('makes web requests with fetch', async () => {
    const fetchMock = vi.fn(async () => new Response('{"name":"Ada"}', { status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runGraph(
      request({
        graph: {
          nodes: [
            node('start', 'event.screenLoad', { screen: 's' }),
            node('get', 'action.fetch', { url: 'https://api.example.com/me', field: 'name' }),
            node('msg', 'action.toast'),
          ],
          edges: [exec('start', 'get'), exec('get', 'msg'), data('get', 'result', 'msg', 'message')],
        },
      }),
      { store: store() },
    );
    expect(result.messages).toEqual(['Ada']);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/me', expect.objectContaining({ method: 'GET' }));
  });

  it('keeps the newest steps of a long run', async () => {
    const result = await runGraph(
      request({
        graph: {
          nodes: [
            node('start', 'event.screenLoad', { screen: 's' }),
            node('loop', 'flow.repeat', { times: 600 }),
            node('add', 'action.changeVariable', { variable: 'n' }),
          ],
          edges: [exec('start', 'loop'), exec('loop', 'add', 'body')],
        },
        variables: [{ id: 'n', type: 'number', initial: 0 }],
      }),
      { store: store() },
    );
    expect(result.vars).toEqual({ n: 600 });
    expect(result.steps).toHaveLength(MAX_STEPS_LOGGED);
    expect(result.dropped).toBe(602 - MAX_STEPS_LOGGED);
    expect(result.steps.at(-1)).toEqual({ nodeId: 'add', inputs: { amount: 1 } });
  });
});
