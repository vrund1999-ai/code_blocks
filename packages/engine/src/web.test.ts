import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, LogicGraph } from './graph';
import { Interpreter } from './interpreter';
import { methodOf, normalizeUrl, parseBody, pickPath, webNodes } from './nodes/web';
import { getNodeDef, inputPins } from './registry';
import { HostError, type GraphError, type HostApi, type HttpRequest, type HttpResponse, type NameLookup } from './types';

/** A host whose web requests are answered by `answer` and recorded in `requests`. */
function makeHost(answer: (req: HttpRequest) => HttpResponse | Promise<HttpResponse>) {
  const vars: Record<string, unknown> = {};
  const toasts: string[] = [];
  const requests: HttpRequest[] = [];
  const host: HostApi = {
    getVar: (id) => vars[id],
    setVar: (id, v) => {
      vars[id] = v;
    },
    getElementValue: () => '',
    setElementProp: () => {},
    toast: (m) => toasts.push(m),
    navigate: () => {},
    storageGet: () => undefined,
    storageSet: () => {},
    sleep: async () => {},
    httpRequest: async (req) => {
      requests.push(req);
      return answer(req);
    },
  };
  return { host, vars, toasts, requests };
}

const json = (value: unknown, status = 200, statusText = 'OK'): HttpResponse => ({
  status,
  statusText,
  text: JSON.stringify(value),
});

let y = 0;
const n = (id: string, type: string, config: Record<string, unknown> = {}): GraphNode => ({
  id,
  type,
  config,
  position: { x: 0, y: y++ },
});
const ex = (source: string, target: string, sourcePin = 'next'): GraphEdge => ({
  id: `${source}-${sourcePin}-${target}`,
  source,
  sourcePin,
  target,
  targetPin: 'in',
  kind: 'exec',
});
const da = (source: string, sourcePin: string, target: string, targetPin: string): GraphEdge => ({
  id: `${source}-${sourcePin}-${target}-${targetPin}`,
  source,
  sourcePin,
  target,
  targetPin,
  kind: 'data',
});

/** Fetch → "Set variable out" to its result, plus toasts of the problem on failure. */
async function fetchRun(
  config: Record<string, unknown>,
  answer: Parameters<typeof makeHost>[0],
  opts: { failBranch?: boolean; extra?: GraphNode[]; extraEdges?: GraphEdge[] } = {},
) {
  const h = makeHost(answer);
  const nodes = [
    n('start', 'event.screenLoad', { screen: 's' }),
    n('fetch', 'action.fetch', config),
    n('save', 'action.setVariable', { variable: 'out' }),
    n('status', 'action.setVariable', { variable: 'status' }),
    n('say', 'action.toast'),
    ...(opts.extra ?? []),
  ];
  const edges = [
    ex('start', 'fetch'),
    ex('fetch', 'save'),
    ex('save', 'status'),
    da('fetch', 'result', 'save', 'value'),
    da('fetch', 'status', 'status', 'value'),
    da('fetch', 'error', 'say', 'message'),
    ...(opts.failBranch ? [ex('fetch', 'say', 'failed')] : []),
    ...(opts.extraEdges ?? []),
  ];
  const graph: LogicGraph = { nodes, edges };
  const error = await new Interpreter(graph, h.host).runEvent('start').then(
    () => null,
    (e: GraphError) => e,
  );
  return { ...h, error };
}

describe('web helpers', () => {
  it('adds https:// to addresses without a scheme', () => {
    expect(normalizeUrl(' api.example.com/x ')).toBe('https://api.example.com/x');
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeUrl('')).toBe('');
  });

  it('parses JSON answers and keeps other text', () => {
    expect(parseBody('{"a":[1,2]}')).toEqual({ a: [1, 2] });
    expect(parseBody('42')).toBe(42);
    expect(parseBody('null')).toBe('');
    expect(parseBody('  ')).toBe('');
    expect(parseBody('<html>hi</html>')).toBe('<html>hi</html>');
  });

  it('picks values by a dotted path, counting list items from 1', () => {
    const data = { main: { Temp: 21 }, results: [{ name: 'Ada' }, { name: 'Bo' }] };
    expect(pickPath(data, 'main.temp')).toBe(21);
    expect(pickPath(data, ' results . 2 . name ')).toBe('Bo');
    expect(pickPath(data, 'results.0.name')).toBe('');
    expect(pickPath(data, 'nope.deeper')).toBe('');
    expect(pickPath(data, '')).toBe(data);
    expect(pickPath('plain text', 'x')).toBe('');
  });

  it('defaults to GET and only offers a "Send" input when sending', () => {
    const def = getNodeDef('action.fetch')!;
    expect(methodOf({})).toBe('GET');
    expect(methodOf({ method: 'teleport' })).toBe('GET');
    expect(inputPins(def, { method: 'GET' }).map((p) => p.id)).toEqual(['in', 'url', 'field', 'headers']);
    expect(inputPins(def, { method: 'POST' }).map((p) => p.id)).toContain('body');
  });

  it('describes the request in plain English', () => {
    const def = getNodeDef('action.fetch')!;
    const names = { element: () => undefined, variable: () => undefined, screen: () => undefined, inList: () => false };
    expect(def.sentence!({ method: 'GET', url: 'api.example.com/weather' }, names)).toBe(
      'Load data from api.example.com',
    );
    expect(def.sentence!({ method: 'POST', url: '' }, names)).toBe('Send data to a web address');
  });
});

describe('Fetch from API', () => {
  it('loads JSON and picks a field', async () => {
    const { vars, requests, error } = await fetchRun(
      { url: 'api.example.com/weather', field: 'current.temp' },
      () => json({ current: { temp: 21 } }),
    );
    expect(error).toBeNull();
    expect(requests).toEqual([{ method: 'GET', url: 'https://api.example.com/weather', headers: {}, body: undefined }]);
    expect(vars.out).toBe(21);
    expect(vars.status).toBe(200);
  });

  it('gives lists of records that list blocks can use', async () => {
    const people = [{ name: 'Ada' }, { name: 'Bo' }];
    const { vars } = await fetchRun({ url: 'https://api.example.com/people' }, () => json(people));
    expect(vars.out).toEqual(people);
  });

  it('sends records as JSON with the headers you give it', async () => {
    const { requests, error } = await fetchRun(
      { method: 'POST', url: 'https://api.example.com/people' },
      () => json({ id: 7 }, 201, 'Created'),
      {
        extra: [
          n('rec', 'data.makeRecord', { fields: [{ id: 'n', name: 'name' }], f_n: 'Ada' }),
          n('hdr', 'data.makeRecord', { fields: [{ id: 'k', name: 'X-Api-Key' }], f_k: 'abc' }),
        ],
        extraEdges: [da('rec', 'value', 'fetch', 'body'), da('hdr', 'value', 'fetch', 'headers')],
      },
    );
    expect(error).toBeNull();
    expect(requests[0]).toEqual({
      method: 'POST',
      url: 'https://api.example.com/people',
      headers: { 'X-Api-Key': 'abc', 'Content-Type': 'application/json' },
      body: '{"name":"Ada"}',
    });
  });

  it('sends typed text as it is, and nothing for GET', async () => {
    const sent = await fetchRun({ method: 'PUT', url: 'x.test', body: 'hello' }, () => json({}));
    expect(sent.requests[0].body).toBe('hello');
    expect(sent.requests[0].headers).toEqual({});
    const get = await fetchRun({ method: 'GET', url: 'x.test', body: 'ignored' }, () => json({}));
    expect(get.requests[0].body).toBeUndefined();
  });

  it('follows "If it fails" on an error answer, with the problem and the answer', async () => {
    const { vars, toasts, error } = await fetchRun(
      { url: 'api.example.com/missing' },
      () => json({ message: 'nope' }, 404, 'Not Found'),
      { failBranch: true },
    );
    expect(error).toBeNull();
    expect(toasts).toEqual(['api.example.com answered with error 404 (Not Found).']);
    expect(vars.out).toBeUndefined(); // "When loaded" did not run
  });

  it('follows "If it fails" when the server cannot be reached', async () => {
    const { toasts } = await fetchRun(
      { url: 'api.example.com' },
      () => {
        throw new TypeError('Failed to fetch');
      },
      { failBranch: true },
    );
    expect(toasts[0]).toMatch(/^Couldn’t reach api\.example\.com\. Check the web address/);
  });

  it('sends the request from the server when “Send from” says so', async () => {
    const { vars, requests } = await fetchRun({ url: 'api.example.com/x', via: 'server' }, () => json({ a: 1 }));
    expect(requests.map((r) => r.viaServer)).toEqual([true]);
    expect(vars.out).toEqual({ a: 1 });

    const fromApp = await fetchRun({ url: 'api.example.com/x' }, () => json({}));
    expect(fromApp.requests[0]).not.toHaveProperty('viaServer');
    const sentence = (c: Record<string, unknown>) => webNodes[0].sentence!(c, {} as NameLookup);
    expect(sentence({ url: 'api.example.com/x', via: 'server' })).toBe('Load data from api.example.com through the server');
    expect(sentence({ url: 'api.example.com/x' })).toBe('Load data from api.example.com');
  });

  it('suggests sending from the server when the app can’t reach an address, and shows the server’s reason', async () => {
    const offline = () => {
      throw new TypeError('Failed to fetch');
    };
    const fromApp = await fetchRun({ url: 'api.example.com' }, offline, { failBranch: true });
    expect(fromApp.toasts[0]).toMatch(/for those, set “Send from” to “The server”\.$/);
    const fromServer = await fetchRun({ url: 'api.example.com', via: 'server' }, offline, { failBranch: true });
    expect(fromServer.toasts[0]).toBe('Couldn’t reach api.example.com. Check the web address and your internet connection.');

    const refused = await fetchRun(
      { url: 'api.example.com', via: 'server' },
      () => {
        throw new HostError('The server couldn’t reach api.example.com.');
      },
      { failBranch: true },
    );
    expect(refused.toasts).toEqual(['The server couldn’t reach api.example.com.']);
  });

  it('shows a block error when a failure has nowhere to go', async () => {
    const { error } = await fetchRun({ url: 'api.example.com' }, () => json('', 500, ''));
    expect(error?.nodeId).toBe('fetch');
    expect(error?.message).toBe('api.example.com answered with error 500.');
  });

  it('asks for a web address when none is given', async () => {
    const { error, requests } = await fetchRun({ url: '  ' }, () => json({}));
    expect(error?.message).toBe('Type the web address to fetch from.');
    expect(requests).toEqual([]);
  });
});
