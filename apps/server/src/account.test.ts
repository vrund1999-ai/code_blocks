import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { EMAIL_TAKEN, NOT_DELIVERED, RESET_EXPIRED, RESET_SENT, SIGN_IN_NEEDED, TOO_MANY_RESETS, WRONG_PASSWORD } from './authRoutes';
import { openDatabase } from './db';
import { SqliteDeployments } from './deployments';
import { DEFAULT_LIMITS } from './limits';
import { LogMailer, MemoryMailer } from './mailer';
import { SqliteProjects } from './projects';
import { SqliteRowStore } from './rows';
import { SqliteSecrets } from './secrets';
import { MemoryStore } from './store';
import { signedIn } from './testAuth';
import { RESET_MINUTES, SqliteUsers } from './users';
import { Workflows } from './workflows';

const send = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { 'Content-Type': 'application/json', origin: 'http://localhost', ...headers },
  body: JSON.stringify(body),
});
const post = (body: unknown, headers?: Record<string, string>) => send('POST', body, headers);

const errorOf = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message;
const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? '';

function setup(opts: Parameters<typeof createApp>[0] = {}) {
  const mailer = new MemoryMailer();
  const users = new SqliteUsers(openDatabase(':memory:'));
  const app = createApp({ mailer, users, publicUrl: 'https://blocks.example.com/', ...opts });
  const signIn = (email: string, password: string) => app.request('/api/auth/signin', post({ email, password }));
  /** The token in the last reset link sent to `to`. */
  const tokenFor = (to: string) => {
    const mail = mailer.sent.filter((m) => m.to === to).at(-1);
    return mail?.text.match(/#reset=([\w-]+)/)?.[1];
  };
  return { app, mailer, users, signIn, tokenFor };
}

describe('password reset', () => {
  it('emails a link that sets a new password once, signs in, and signs out other sessions', async () => {
    const { app, mailer, signIn, tokenFor } = setup();
    const ada = await signedIn(app, 'ada@example.com');

    // The same answer whether or not there's an account, and only accounts get an email.
    for (const email of ['Ada@Example.com', 'nobody@example.com']) {
      const res = await app.request('/api/auth/reset', post({ email }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, message: RESET_SENT });
    }
    await Promise.resolve();
    expect(mailer.sent.map((m) => m.to)).toEqual(['ada@example.com']);
    expect(mailer.sent[0].subject).toBe('Choose a new password for Code Blocks');
    expect(mailer.sent[0].text).toMatch(new RegExp(`https://blocks\\.example\\.com/#reset=[\\w-]{43}\\n`));
    expect(mailer.sent[0].text).toContain(`within ${RESET_MINUTES} minutes`);
    const token = tokenFor('ada@example.com')!;

    const short = await app.request('/api/auth/reset/finish', post({ token, password: 'short' }));
    expect(short.status).toBe(400);
    const done = await app.request('/api/auth/reset/finish', post({ token, password: 'battery staple' }));
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ user: { id: expect.any(String), email: 'ada@example.com' } });
    // Signed in with the new password; the old session and password no longer work.
    expect(await (await app.request('/api/auth/me', { headers: { cookie: cookieOf(done) } })).json()).toMatchObject({
      user: { email: 'ada@example.com' },
    });
    expect(await (await ada('/api/auth/me')).json()).toEqual({ user: null });
    expect((await signIn('ada@example.com', 'correct horse')).status).toBe(401);
    expect((await signIn('ada@example.com', 'battery staple')).status).toBe(200);

    const again = await app.request('/api/auth/reset/finish', post({ token, password: 'another one' }));
    expect(again.status).toBe(400);
    expect(await errorOf(again)).toBe(RESET_EXPIRED);
  });

  it('links stop working after an hour, or when a newer one is sent', async () => {
    const { app, users, tokenFor } = setup();
    await signedIn(app, 'bo@example.com');
    const bo = users.findByEmail('bo@example.com')!;
    const old = users.startReset(bo.id, Date.now() - RESET_MINUTES * 60 * 1000 - 1);
    expect(await errorOf(await app.request('/api/auth/reset/finish', post({ token: old, password: 'battery staple' })))).toBe(
      RESET_EXPIRED,
    );

    await app.request('/api/auth/reset', post({ email: 'bo@example.com' }));
    const first = tokenFor('bo@example.com')!;
    await app.request('/api/auth/reset', post({ email: 'bo@example.com' }));
    const second = tokenFor('bo@example.com')!;
    expect(second).not.toBe(first);
    expect((await app.request('/api/auth/reset/finish', post({ token: first, password: 'battery staple' }))).status).toBe(400);
    expect((await app.request('/api/auth/reset/finish', post({ token: second, password: 'battery staple' }))).status).toBe(200);
  });

  it('links to the page that asked, when no PUBLIC_URL is set', async () => {
    const { app, mailer } = setup({ publicUrl: undefined });
    await signedIn(app, 'cy@example.com');
    await app.request('/api/auth/reset', post({ email: 'cy@example.com' }, { origin: 'http://localhost:5173' }));
    expect(mailer.sent[0].text).toContain('http://localhost:5173/#reset=');
  });

  it('says where the link is when the server only logs emails', async () => {
    const app = createApp({ mailer: new LogMailer() });
    const res = await app.request('/api/auth/reset', post({ email: 'nobody@example.com' }));
    expect(await res.json()).toEqual({ ok: true, message: `${RESET_SENT} ${NOT_DELIVERED}` });
  });

  it('are limited per email', async () => {
    const { app, mailer } = setup({ limits: { ...DEFAULT_LIMITS, reset: { count: 2, seconds: 3600 } } });
    await signedIn(app, 'di@example.com');
    for (let i = 0; i < 2; i++) expect((await app.request('/api/auth/reset', post({ email: 'di@example.com' }))).status).toBe(200);
    const blocked = await app.request('/api/auth/reset', post({ email: 'DI@example.com' }));
    expect(blocked.status).toBe(429);
    expect(await errorOf(blocked)).toBe(`${TOO_MANY_RESETS} Try again in an hour.`);
    expect(mailer.sent).toHaveLength(2);
  });
});

describe('account settings', () => {
  it('change the password with the current one, keeping only this session', async () => {
    const { app, signIn } = setup();
    const ada = await signedIn(app, 'ada@example.com');
    const other = cookieOf(await signIn('ada@example.com', 'correct horse'));

    const wrong = await ada('/api/auth/password', post({ password: 'wrong horse', newPassword: 'battery staple' }));
    expect(wrong.status).toBe(403);
    expect(await errorOf(wrong)).toBe(WRONG_PASSWORD);
    expect((await ada('/api/auth/password', post({ password: 'correct horse', newPassword: 'short' }))).status).toBe(400);
    expect((await ada('/api/auth/password', post({ password: 'correct horse', newPassword: 'battery staple' }))).status).toBe(200);

    expect(await (await ada('/api/auth/me')).json()).toMatchObject({ user: { email: 'ada@example.com' } });
    expect(await (await app.request('/api/auth/me', { headers: { cookie: other } })).json()).toEqual({ user: null });
    expect((await signIn('ada@example.com', 'battery staple')).status).toBe(200);
  });

  it('change the email, telling the old one, unless another account has it', async () => {
    const { app, mailer, signIn, users } = setup();
    const ada = await signedIn(app, 'ada@example.com');
    await signedIn(app, 'bo@example.com');
    const ownId = users.findByEmail('ada@example.com')!.id;
    const reset = users.startReset(ownId);

    const taken = await ada('/api/auth/email', post({ password: 'correct horse', email: 'BO@example.com' }));
    expect(taken.status).toBe(409);
    expect(await errorOf(taken)).toBe(EMAIL_TAKEN);
    expect((await ada('/api/auth/email', post({ password: 'correct horse', email: 'not an email' }))).status).toBe(400);
    expect((await ada('/api/auth/email', post({ password: 'wrong horse', email: 'ada@new.example' }))).status).toBe(403);

    const changed = await ada('/api/auth/email', post({ password: 'correct horse', email: ' Ada@New.example ' }));
    expect(await changed.json()).toEqual({ user: { id: ownId, email: 'ada@new.example' } });
    expect(await (await ada('/api/auth/me')).json()).toMatchObject({ user: { email: 'ada@new.example' } });
    expect((await signIn('ada@new.example', 'correct horse')).status).toBe(200);
    expect((await signIn('ada@example.com', 'correct horse')).status).toBe(401);
    await Promise.resolve();
    expect(mailer.sent).toMatchObject([{ to: 'ada@example.com', subject: 'Your Code Blocks email was changed' }]);
    // A link sent to the old email no longer works.
    expect((await app.request('/api/auth/reset/finish', post({ token: reset, password: 'battery staple' }))).status).toBe(400);
  });

  it('need signing in', async () => {
    const { app } = setup();
    for (const [path, method] of [
      ['/api/auth/password', 'POST'],
      ['/api/auth/email', 'POST'],
      ['/api/auth/account', 'DELETE'],
    ]) {
      const res = await app.request(path, send(method, { password: 'correct horse' }));
      expect(res.status, path).toBe(401);
      expect(await errorOf(res), path).toBe(SIGN_IN_NEEDED);
    }
  });

  it('delete the account with its projects’ saved copies, rows, secrets, saved values, deployments and published apps', async () => {
    const db = openDatabase(':memory:');
    const rows = new SqliteRowStore(db);
    const secrets = new SqliteSecrets(db);
    const store = new MemoryStore();
    const projects = new SqliteProjects(db);
    const workflows = new Workflows({ deployments: new SqliteDeployments(db), store, rows, secrets });
    const { app, signIn } = setup({ rows, secrets, store, projects, workflows });
    const ada = await signedIn(app, 'ada@example.com');
    const bo = await signedIn(app, 'bo@example.com');

    const project = (id: string) => ({
      version: 2,
      id,
      name: 'Shop',
      screens: [{ id: 's1', name: 'Home', root: { id: 'r1', type: 'container', name: 'Screen', props: {}, children: [] } }],
      variables: [],
      tables: [],
      graph: { nodes: [], edges: [] },
    });
    for (const [as, id] of [
      [ada, 'p1'],
      [bo, 'p2'],
    ] as const) {
      expect((await as(`/api/projects/${id}`, send('PUT', { project: project(id) }))).status).toBe(200);
      expect((await as(`/api/projects/${id}/tables/t1/rows`, post({ values: { c1: 'x' } }))).status).toBe(201);
      expect((await as(`/api/projects/${id}/secrets/API_KEY`, send('PUT', { value: 'sk-123456789' }))).status).toBe(200);
      expect(
        (await as(`/api/projects/${id}/deployment`, send('PUT', { name: 'Shop', fingerprint: 'a', variables: [], tables: [], graph: { nodes: [], edges: [] } })))
          .status,
      ).toBe(200);
      expect((await as(`/api/projects/${id}/publication`, send('PUT', { project: project(id), fingerprint: 'a' }))).status).toBe(200);
      store.set(id, 'count', 3);
    }

    expect((await ada('/api/auth/account', send('DELETE', { password: 'wrong horse' }))).status).toBe(403);
    const gone = await ada('/api/auth/account', send('DELETE', { password: 'correct horse' }));
    expect(gone.status).toBe(200);
    expect(gone.headers.get('set-cookie')).toMatch(/cb_session=;/);

    expect(await (await ada('/api/auth/me')).json()).toEqual({ user: null });
    expect((await signIn('ada@example.com', 'correct horse')).status).toBe(401);
    expect(projects.get('p1')).toBeUndefined();
    expect(rows.list('p1', 't1').total).toBe(0);
    expect(secrets.list('p1')).toEqual([]);
    expect(store.get('p1', 'count')).toBeUndefined();
    expect(workflows.summary('p1')).toBeUndefined();
    // The other account keeps everything.
    expect(projects.get('p2')).toBeDefined();
    expect(rows.list('p2', 't1').total).toBe(1);
    expect(secrets.list('p2')).toHaveLength(1);
    expect(store.get('p2', 'count')).toBe(3);
    expect(workflows.summary('p2')).toBeDefined();
    expect(await (await bo('/api/projects/p2/publication')).json()).toMatchObject({ published: true });
    expect(await (await bo('/api/projects/p1/publication')).json()).toEqual({ published: false });

    // The email can make a new account, which starts empty.
    const again = await signedIn(app, 'ada@example.com');
    expect(await (await again('/api/projects')).json()).toEqual({ projects: [] });
  });
});
