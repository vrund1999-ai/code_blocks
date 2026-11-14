// Accounts and sign-in:
//   POST /api/auth/signup   { email, password }  → { user }, and signs in
//   POST /api/auth/signin   { email, password }  → { user }
//   POST /api/auth/signout
//   GET  /api/auth/me       → { user } (null when signed out)
// plus the middleware that finds the signed-in account and guards the
// routes that need one.

import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { emailProblem, passwordProblem, SESSION_DAYS, type SqliteUsers, type User } from './users';

export const SESSION_COOKIE = 'cb_session';

export type AuthEnv = { Variables: { user: User | null } };

export const SIGN_IN_NEEDED = 'Sign in to use the Code Blocks server: deploying, secrets, data tables and requests sent from the server.';
export const NOT_YOURS = 'This project belongs to another account.';

const problem = (message: string) => ({ error: { message } });

/** Finds the signed-in account from the session cookie, for every route. */
export function loadUser(users: SqliteUsers): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    c.set('user', token ? users.sessionUser(token) : null);
    await next();
  };
}

/** Refuses requests from people who aren't signed in. */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (!c.get('user')) return c.json(problem(SIGN_IN_NEEDED), 401);
  await next();
};

/**
 * Whether the signed-in account may use the project, answering 403 when it
 * can't. A project nobody has used on the server yet becomes theirs.
 */
export function canUseProject(c: Context<AuthEnv>, users: SqliteUsers, projectId: string): Response | null {
  const user = c.get('user');
  if (!user) return c.json(problem(SIGN_IN_NEEDED), 401);
  return users.claimProject(projectId, user.id) ? null : c.json(problem(NOT_YOURS), 403);
}

function startSession(c: Context, users: SqliteUsers, user: User) {
  setCookie(c, SESSION_COOKIE, users.startSession(user.id), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/api',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

async function readCredentials(c: Context): Promise<{ email: string; password: string } | string> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return 'Send your email and password as JSON.';
  }
  const { email, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') return 'Send your email and password as JSON.';
  return { email: email.trim(), password };
}

export function authRoutes(users: SqliteUsers) {
  const app = new Hono<AuthEnv>();
  const limit = bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.json(problem('The request is too big.'), 413) });

  app.get('/me', (c) => c.json({ user: c.get('user') }));

  app.post('/signup', limit, async (c) => {
    const creds = await readCredentials(c);
    if (typeof creds === 'string') return c.json(problem(creds), 400);
    const bad = emailProblem(creds.email) ?? passwordProblem(creds.password);
    if (bad) return c.json(problem(bad), 400);
    const user = await users.create(creds.email, creds.password);
    if (!user) return c.json(problem('There’s already an account with that email. Sign in instead.'), 409);
    startSession(c, users, user);
    return c.json({ user });
  });

  app.post('/signin', limit, async (c) => {
    const creds = await readCredentials(c);
    if (typeof creds === 'string') return c.json(problem(creds), 400);
    const user = await users.verify(creds.email, creds.password);
    if (!user) return c.json(problem('That email and password don’t match an account.'), 401);
    startSession(c, users, user);
    return c.json({ user });
  });

  app.post('/signout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) users.endSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/api' });
    return c.json({ ok: true });
  });

  return app;
}
