import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, requestsSettled } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });

describe('requestsSettled', () => {
  it('waits for every request, including ones sent while waiting', async () => {
    const answers: (() => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => answers.push(() => resolve(ok())))));
    const done: string[] = [];
    void call('/api/a').then(() => done.push('a'));
    void call('/api/b').then(() => {
      done.push('b');
      void call('/api/c').then(() => done.push('c'));
    });
    let settled = false;
    const waiting = requestsSettled().then(() => (settled = true));
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    answers[1]();
    await vi.waitFor(() => expect(answers).toHaveLength(3));
    answers[0]();
    await vi.waitFor(() => expect(done).toEqual(['b', 'a']));
    expect(settled).toBe(false);
    answers[2]();
    await waiting;
    expect(done).toEqual(['b', 'a', 'c']);
  });

  it('counts failed requests as answered', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(call('/api/a')).rejects.toThrow();
    await requestsSettled();
  });

  it('stops waiting after a while', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    void call('/api/never');
    const waiting = requestsSettled(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await waiting;
  });
});
