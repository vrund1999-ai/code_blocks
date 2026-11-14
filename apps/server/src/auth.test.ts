import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { NOT_YOURS, SIGN_IN_NEEDED } from './authRoutes';
import { openDatabase } from './db';
import { signedIn } from './testAuth';
import { checkPassword, hashPassword, SESSION_DAYS, SqliteUsers } from './users';

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const errorOf = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message;

describe('passwords', () => {
  it('are stored hashed with a salt, and checked', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toContain('correct horse');
    expect(a).not.toBe(b);
    expect(await checkPassword('correct horse', a)).toBe(true);
    expect(await checkPassword('wrong horse', a)).toBe(false);
    expect(await checkPassword('correct horse', 'nonsense')).toBe(false);
  });
});

describe('accounts', () => {
  it('sign up, stay signed in with a cookie, sign out and sign in again', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/signup', json({ email: ' Ada@Example.com ', password: 'correct horse' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: expect.any(String), email: 'ada@example.com' } });
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^cb_session=[\w-]{43};/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Path=\/api/);
    expect(setCookie).toMatch(new RegExp(`Max-Age=${SESSION_DAYS * 86400}`));
    const cookie = setCookie.split(';')[0];

    const me = await app.request('/api/auth/me', { headers: { cookie } });
    expect(await me.json()).toEqual({ user: { id: expect.any(String), email: 'ada@example.com' } });

    const out = await app.request('/api/auth/signout', json({}, { cookie }));
    expect(out.headers.get('set-cookie')).toMatch(/cb_session=;/);
    // The old cookie no longer works.
    expect(await (await app.request('/api/auth/me', { headers: { cookie } })).json()).toEqual({ user: null });

    const wrong = await app.request('/api/auth/signin', json({ email: 'ada@example.com', password: 'wrong horse' }));
    expect(wrong.status).toBe(401);
    expect(await errorOf(wrong)).toBe('That email and password don’t match an account.');
    const nobody = await app.request('/api/auth/signin', json({ email: 'bo@example.com', password: 'correct horse' }));
    expect(await errorOf(nobody)).toBe('That email and password don’t match an account.');

    const back = await app.request('/api/auth/signin', json({ email: 'ADA@example.com', password: 'correct horse' }));
    expect(back.status).toBe(200);
    expect(back.headers.get('set-cookie')).toMatch(/^cb_session=/);
  });

  it.each([
    ['a bad email', { email: 'ada', password: 'correct horse' }, 400, 'Type your email address, like ada@example.com.'],
    ['a short password', { email: 'ada@example.com', password: 'short' }, 400, 'Use a password of at least 8 characters.'],
    ['no password', { email: 'ada@example.com' }, 400, 'Send your email and password as JSON.'],
  ])('refuses to sign up with %s', async (_, body, status, message) => {
    const res = await createApp().request('/api/auth/signup', json(body));
    expect(res.status).toBe(status);
    expect(await errorOf(res)).toBe(message);
  });

  it('refuses a second account for the same email', async () => {
    const app = createApp();
    await app.request('/api/auth/signup', json({ email: 'ada@example.com', password: 'correct horse' }));
    const again = await app.request('/api/auth/signup', json({ email: 'ADA@example.com', password: 'another one' }));
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe('There’s already an account with that email. Sign in instead.');
  });

  it('end sessions after their time is up', async () => {
    const users = new SqliteUsers(openDatabase(':memory:'));
    const user = (await users.create('ada@example.com', 'correct horse'))!;
    const token = users.startSession(user.id, 0);
    expect(users.sessionUser(token, 1000)).toEqual(user);
    expect(users.sessionUser(token, SESSION_DAYS * 86400 * 1000)).toBeNull();
  });
});

describe('who can use what', () => {
  const run = {
    graph: { nodes: [{ id: 'go', type: 'server.schedule' }], edges: [] },
    nodeId: 'go',
    projectId: 'p1',
  };

  it('asks guests to sign in for project routes, runs and requests from the server', async () => {
    const app = createApp();
    for (const [path, init] of [
      ['/api/projects/p1/secrets', {}],
      ['/api/projects/p1/deployment', {}],
      ['/api/projects/p1/tables/t1/rows', {}],
      ['/api/run', json(run)],
      ['/api/fetch', json({ method: 'GET', url: 'https://example.test' })],
    ] as const) {
      const res = await app.request(path, init);
      expect(res.status, path).toBe(401);
      expect(await errorOf(res)).toBe(SIGN_IN_NEEDED);
    }
    // What anyone may ask stays open.
    expect((await app.request('/api/health')).status).toBe(200);
    expect(await (await app.request('/api/auth/me')).json()).toEqual({ user: null });
    expect((await app.request('/api/hooks/p1/orders')).status).toBe(404);
    expect((await app.request('/api/projects/p1/forms/signup', json({ values: {} }))).status).toBe(404);
  });

  it('gives a project to the first account that uses it, and keeps others out', async () => {
    const app = createApp();
    const ada = await signedIn(app);
    const bo = await signedIn(app);
    expect((await ada('/api/projects/p1/secrets')).status).toBe(200);
    expect((await bo('/api/projects/p2/secrets')).status).toBe(200);

    for (const res of [await bo('/api/projects/p1/secrets'), await bo('/api/run', json(run))]) {
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toBe(NOT_YOURS);
    }
    expect((await ada('/api/run', json(run))).status).toBe(200);
    expect((await ada('/api/projects/p2/deployment')).status).toBe(403);
  });

  it('refuses forms sent from other sites', async () => {
    const app = createApp();
    const ada = await signedIn(app);
    const res = await ada('/api/projects/p1/secrets/KEY', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain', origin: 'https://evil.example' },
      body: JSON.stringify({ value: 'abcd1234' }),
    });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('This request came from another site, so it was refused.');
  });
});
