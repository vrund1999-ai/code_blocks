import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, TOO_MANY_CALLS, TOO_MANY_REQUESTS } from './app';
import { TOO_MANY_SIGN_INS, TOO_MANY_SIGN_UPS } from './authRoutes';
import { DEFAULT_LIMITS, RateLimiter, waitText, type Limits } from './limits';
import { signedIn } from './testAuth';

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', origin: 'http://localhost', ...headers },
  body: JSON.stringify(body),
});

const errorOf = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message;

/** Tight limits, so tests reach them quickly. */
const limits = (overrides: Partial<Limits> = {}): Limits => ({ ...DEFAULT_LIMITS, ...overrides });

afterEach(() => vi.unstubAllGlobals());

describe('RateLimiter', () => {
  it('allows `count` per window, then says how long to wait', () => {
    let now = 0;
    const limiter = new RateLimiter({ count: 2, seconds: 60 }, () => now);
    expect(limiter.take('a')).toBe(0);
    expect(limiter.take('a')).toBe(0);
    expect(limiter.take('a')).toBe(60);
    expect(limiter.take('b')).toBe(0);
    now = 45_000;
    expect(limiter.wait('a')).toBe(15);
    now = 60_000;
    expect(limiter.take('a')).toBe(0);
  });

  it.each([
    [1, 'a second'],
    [30, '30 seconds'],
    [60, 'a minute'],
    [61, '2 minutes'],
    [3600, 'an hour'],
    [7200, '2 hours'],
  ])('waitText(%i) is “%s”', (seconds, text) => {
    expect(waitText(seconds)).toBe(text);
  });
});

describe('limits on a hosted server', () => {
  it('stop guessing passwords for an email, counting only failed sign-ins', async () => {
    const app = createApp({ limits: limits({ signIn: { count: 3, seconds: 900 } }) });
    await signedIn(app, 'ada@example.com');
    const signIn = (email: string, password: string) => app.request('/api/auth/signin', json({ email, password }));

    for (let i = 0; i < 2; i++) expect((await signIn('ada@example.com', 'wrong')).status).toBe(401);
    expect((await signIn('ada@example.com', 'correct horse')).status).toBe(200);
    expect((await signIn('ada@example.com', 'wrong')).status).toBe(401);

    const blocked = await signIn('Ada@Example.com', 'correct horse');
    expect(blocked.status).toBe(429);
    // The window started with the first failed sign-in; checking passwords takes a moment.
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(880);
    expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(900);
    expect(await errorOf(blocked)).toBe(`${TOO_MANY_SIGN_INS} Try again in 15 minutes.`);
    // Other emails aren't affected.
    expect((await signIn('bo@example.com', 'wrong')).status).toBe(401);
  });

  it('limit new accounts per address, read from X-Forwarded-For behind a proxy', async () => {
    const app = createApp({ limits: limits({ signUp: { count: 2, seconds: 3600 } }), trustProxy: true });
    const signUp = (email: string, from: string) =>
      app.request('/api/auth/signup', json({ email, password: 'correct horse' }, { 'x-forwarded-for': `${from}, 10.0.0.1` }));

    expect((await signUp('a@example.com', '203.0.113.1')).status).toBe(200);
    // A refused sign-up doesn't count.
    expect((await signUp('a@example.com', '203.0.113.1')).status).toBe(409);
    expect((await signUp('b@example.com', '203.0.113.1')).status).toBe(200);
    const blocked = await signUp('c@example.com', '203.0.113.1');
    expect(blocked.status).toBe(429);
    expect(await errorOf(blocked)).toBe(`${TOO_MANY_SIGN_UPS} Try again in an hour.`);
    expect((await signUp('c@example.com', '203.0.113.2')).status).toBe(200);
  });

  it('limit requests sent through the server per account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')));
    const app = createApp({ limits: limits({ fetch: { count: 2, seconds: 60 } }) });
    const ada = await signedIn(app);
    const bo = await signedIn(app);
    const send = (as: typeof ada) => as('/api/fetch', json({ method: 'GET', url: 'https://example.test/' }));

    expect((await send(ada)).status).toBe(200);
    expect((await send(ada)).status).toBe(200);
    const blocked = await send(ada);
    expect(blocked.status).toBe(429);
    expect(await errorOf(blocked)).toBe(`${TOO_MANY_REQUESTS} Try again in a minute.`);
    expect((await send(bo)).status).toBe(200);
  });

  it('limit calls to a project’s web addresses and forms together, per project', async () => {
    const app = createApp({ limits: limits({ workflow: { count: 2, seconds: 60 } }) });
    expect((await app.request('/api/hooks/p1/hello')).status).toBe(404);
    expect((await app.request('/api/projects/p1/forms/signup', json({ values: {} }))).status).toBe(404);
    const blocked = await app.request('/api/hooks/p1/hello');
    expect(blocked.status).toBe(429);
    expect(await errorOf(blocked)).toBe(`${TOO_MANY_CALLS} Try again in a minute.`);
    expect((await app.request('/api/hooks/p2/hello')).status).toBe(404);
  });

  it('are off unless asked for', async () => {
    const app = createApp();
    for (let i = 0; i < 20; i++) expect((await app.request('/api/hooks/p1/hello')).status).toBe(404);
  });
});
