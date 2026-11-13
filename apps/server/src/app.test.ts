import { describe, expect, it } from 'vitest';
import { createApp, MAX_BODY_BYTES } from './app';
import { exec, node } from './testGraph';

const post = (body: unknown) =>
  createApp().request('/api/run', {
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

  it.each([
    ['not JSON', 'nope', 'The request body must be JSON.'],
    ['not an object', [1], 'Send a JSON object.'],
    ['no graph', { nodeId: 'start' }, '"graph" needs "nodes" and "edges" lists.'],
    ['a broken wire', { ...hello, graph: { ...hello.graph, edges: [{ id: 'x' }] } }, /graph\.edges\[0\] needs/],
    ['a missing block', { ...hello, nodeId: 'nope' }, 'There is no block "nope" in the graph.'],
    ['a block that is not an event', { ...hello, nodeId: 'msg' }, 'Block "msg" is not an event block, so it can\'t start a run.'],
    ['a bad variable', { ...hello, variables: [{ id: 'v', type: 'date' }] }, /variables\[0\] needs/],
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
