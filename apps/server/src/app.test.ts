import { describe, expect, it } from 'vitest';
import { createApp, MAX_BODY_BYTES } from './app';
import { exec, node } from './testGraph';
import { asUser } from './testAuth';

const post = (body: unknown) =>
  asUser(createApp())('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const hello = {
  graph: {
    nodes: [node('start', 'event.click', { element: 'btn' }), node('msg', 'action.toast', { message: 'Hello' })],
    edges: [exec('start', 'msg')],
  },
  nodeId: 'start',
};

describe('server routes', () => {
  it('answers a health check', async () => {
    const res = await createApp().request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('runs a graph', async () => {
    const res = await post(hello);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, messages: ['Hello'], vars: {} });
  });

  it('returns block errors as a finished run', async () => {
    const res = await post({ ...hello, graph: { ...hello.graph, nodes: [hello.graph.nodes[0], node('msg', 'action.setText')] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, error: { nodeId: 'msg' } });
  });

  it('lets Reply blocks answer when replies are asked for', async () => {
    const graph = {
      nodes: [node('hook', 'server.http', { path: 'hi' }), node('reply', 'server.reply', { value: 'Hi', status: 201 })],
      edges: [exec('hook', 'reply')],
    };
    const tried = await post({ graph, nodeId: 'hook', payload: { body: '', query: {}, method: 'GET' }, replies: true });
    expect(await tried.json()).toMatchObject({ ok: true, reply: { value: 'Hi', status: 201 } });
    const plain = await post({ graph, nodeId: 'hook' });
    expect(await plain.json()).toMatchObject({ ok: false, error: { nodeId: 'reply' } });
  });

  it.each([
    ['not JSON', 'nope', 'The request body must be JSON.'],
    ['not an object', [1], 'Send a JSON object.'],
    ['no graph', { nodeId: 'start' }, '"graph" needs "nodes" and "edges" lists.'],
    ['a broken wire', { ...hello, graph: { ...hello.graph, edges: [{ id: 'x' }] } }, /^In wire 1: “source” is missing\./],
    ['replies that are not true or false', { ...hello, replies: 'yes' }, '"replies" must be true or false.'],
    ['a missing block', { ...hello, nodeId: 'nope' }, 'There is no block "nope" in the graph.'],
    ['a block that is not an event', { ...hello, nodeId: 'msg' }, 'Block "msg" is not an event block, so it can\'t start a run.'],
    ['a bad variable', { ...hello, variables: [{ id: 'v', type: 'date' }] }, 'In variable 1: “type” is “date”, which should be one of text, number, boolean, list, record.'],
    ['a bad table', { ...hello, tables: [{ id: 't', name: 'T', columns: [{ id: 'c', name: 'C', type: 'date' }] }] }, 'In table “T” → column “C”: “type” is “date”, which should be one of text, number, boolean.'],
  ])('rejects %s', async (_, body, message) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(message);
  });

  it('rejects requests over the size limit', async () => {
    const res = await post({ ...hello, payload: { big: 'x'.repeat(MAX_BODY_BYTES) } });
    expect(res.status).toBe(413);
  });

  it('answers unknown routes with 404', async () => {
    const res = await createApp().request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { message: 'Not found.' } });
  });
});
