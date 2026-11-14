import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { parseFetchRequest } from './fetchRoutes';
import { MAX_ANSWER_BYTES } from './http';

afterEach(() => {
  vi.unstubAllGlobals();
});

const send = (body: unknown) =>
  createApp().request('/api/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('parseFetchRequest', () => {
  it.each([
    ['not an object', [], /Send the request as JSON/],
    ['an unknown method', { method: 'TRACE', url: 'https://a.test' }, /"method" must be one of GET, POST/],
    ['no address', { method: 'GET' }, '"url" must be a web address.'],
    ['a bad address', { method: 'GET', url: 'not an address' }, '“not an address” isn’t a web address.'],
    ['another scheme', { method: 'GET', url: 'file:///etc/passwd' }, 'Only http:// and https:// web addresses can be fetched.'],
    ['headers that aren’t text', { method: 'GET', url: 'https://a.test', headers: { n: 1 } }, /"headers" must be a record/],
    ['data that isn’t text', { method: 'POST', url: 'https://a.test', body: { a: 1 } }, '"body" must be text.'],
    ['data on a Get', { method: 'GET', url: 'https://a.test', body: 'x' }, 'A Get request can’t send data.'],
  ])('refuses %s', (_, body, message) => {
    expect(parseFetchRequest(body)).toMatch(message);
  });

  it('accepts lower-case methods and leaves out missing parts', () => {
    expect(parseFetchRequest({ method: 'post', url: 'https://a.test/x?q=1' })).toEqual({
      method: 'POST',
      url: 'https://a.test/x?q=1',
      headers: {},
      body: undefined,
    });
  });
});

describe('POST /api/fetch', () => {
  it('sends the request and gives back the answer, error answers included', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"nope"}', { status: 404, statusText: 'Not Found' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await send({ method: 'PUT', url: 'https://api.example.test/x', headers: { 'X-Key': 'k' }, body: '{"a":1}' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 404, statusText: 'Not Found', text: '{"error":"nope"}' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/x',
      expect.objectContaining({ method: 'PUT', headers: { 'X-Key': 'k' }, body: '{"a":1}' }),
    );
  });

  it('says when the address can’t be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const res = await send({ method: 'GET', url: 'https://api.example.test/x' });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { message: 'The server couldn’t reach api.example.test. Check the web address and your internet connection.' },
    });
  });

  it('refuses answers that are too big', async () => {
    const big = 'x'.repeat(MAX_ANSWER_BYTES + 1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob([big]).stream())));
    const res = await send({ method: 'GET', url: 'https://api.example.test/big' });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      'api.example.test answered with more than 5 MB of data, which is too much.',
    );
  });

  it('refuses bad requests without sending anything', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await send({ method: 'GET', url: 'ftp://files.example.test' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
