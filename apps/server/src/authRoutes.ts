// Accounts and sign-in:
//   POST /api/auth/signup   { email, password }  → { user }, and signs in
//   POST /api/auth/signin   { email, password }  → { user }
//   POST /api/auth/signout
//   GET  /api/auth/me       → { user } (null when signed out)
//   POST /api/auth/reset           { email }: emails a link to choose a new password, if there's such an account
//   POST /api/auth/reset/finish    { token, password }  → { user }, and signs in
// and for the signed-in account, each checking its password:
//   POST   /api/auth/password      { password, newPassword }: signs out its other sessions
//   POST   /api/auth/email         { password, email }  → { user }
//   DELETE /api/auth/account       { password }: deletes it with its projects and their data
// plus the middleware that finds the signed-in account and guards the
// routes that need one.

import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { tooMany, type RateLimiter } from './limits';
import type { Email, Mailer } from './mailer';
import { emailProblem, passwordProblem, RESET_MINUTES, SESSION_DAYS, type SqliteUsers, type User } from './users';

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

/** Whether the person reached the server over https, also behind a proxy that says so. */
function overHttps(c: Context, trustProxy: boolean) {
  if (trustProxy && c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https') return true;
  return new URL(c.req.url).protocol === 'https:';
}

function startSession(c: Context, users: SqliteUsers, user: User, trustProxy: boolean) {
  setCookie(c, SESSION_COOKIE, users.startSession(user.id), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: overHttps(c, trustProxy),
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

/** The JSON object a request sent, or null. */
async function readObject(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface AuthLimits {
  /** Failed sign-ins and wrong passwords, keyed by address and email. */
  signIn: RateLimiter;
  /** Password reset emails, keyed by email. */
  reset: RateLimiter;
  /** New accounts, keyed by address. */
  signUp: RateLimiter;
  /** Where a request came from. */
  addressOf(c: Context): string;
}

export const TOO_MANY_SIGN_INS = 'Too many sign-in attempts with that email.';
export const TOO_MANY_SIGN_UPS = 'Too many new accounts from your network.';
export const TOO_MANY_RESETS = 'Too many password reset emails were asked for with that email.';
export const RESET_SENT = `If there’s an account with that email, we’ve sent it a link to choose a new password. The link works for ${RESET_MINUTES} minutes.`;
/** Added when emails only go to the server's log, as when developing. */
export const NOT_DELIVERED = 'This server doesn’t send email yet: the link is in the server’s log.';
export const RESET_EXPIRED = 'This link to choose a new password has expired or was already used. Ask for a new one.';
export const WRONG_PASSWORD = 'That isn’t your current password.';
export const EMAIL_TAKEN = 'There’s already an account with that email.';

export interface AuthOptions {
  limits?: AuthLimits;
  /** Behind a proxy: believe its X-Forwarded-Proto. */
  trustProxy?: boolean;
  /** Sends password reset links and notices. Without one, nothing is sent. */
  mailer?: Mailer;
  /**
   * Where the editor is, for the links in emails, like https://blocks.example.com.
   * Left out (when developing), the page that asked is used.
   */
  publicUrl?: string;
  /** Deletes an account's projects and their data, before the account itself goes. */
  deleteProjects?(userId: string): void;
}

/** Sends an email without waiting, so answers take as long whether or not an email went out. */
function sendLater(mailer: Mailer | undefined, email: Email) {
  mailer?.send(email).catch((err: unknown) => console.error(`Couldn’t send “${email.subject}” to ${email.to}:`, err));
}

export function authRoutes(
  users: SqliteUsers,
  { limits, trustProxy = false, mailer, publicUrl, deleteProjects }: AuthOptions = {},
) {
  const app = new Hono<AuthEnv>();
  const limit = bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.json(problem('The request is too big.'), 413) });

  app.get('/me', (c) => c.json({ user: c.get('user') }));

  app.post('/signup', limit, async (c) => {
    const creds = await readCredentials(c);
    if (typeof creds === 'string') return c.json(problem(creds), 400);
    const bad = emailProblem(creds.email) ?? passwordProblem(creds.password);
    if (bad) return c.json(problem(bad), 400);
    const address = limits?.addressOf(c) ?? '';
    const wait = limits?.signUp.wait(address);
    if (wait) return tooMany(c, wait, TOO_MANY_SIGN_UPS);
    const user = await users.create(creds.email, creds.password);
    if (!user) return c.json(problem('There’s already an account with that email. Sign in instead.'), 409);
    limits?.signUp.count(address);
    startSession(c, users, user, trustProxy);
    return c.json({ user });
  });

  app.post('/signin', limit, async (c) => {
    const creds = await readCredentials(c);
    if (typeof creds === 'string') return c.json(problem(creds), 400);
    // Only failed attempts count, so people who mistype a few times aren't locked out.
    const key = `${limits?.addressOf(c) ?? ''} ${creds.email.toLowerCase()}`;
    const wait = limits?.signIn.wait(key);
    if (wait) return tooMany(c, wait, TOO_MANY_SIGN_INS);
    const user = await users.verify(creds.email, creds.password);
    if (!user) {
      limits?.signIn.count(key);
      return c.json(problem('That email and password don’t match an account.'), 401);
    }
    startSession(c, users, user, trustProxy);
    return c.json({ user });
  });

  app.post('/reset', limit, async (c) => {
    const body = await readObject(c);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const bad = emailProblem(email);
    if (bad) return c.json(problem(bad), 400);
    // Keeps anyone from filling someone's inbox with reset emails.
    const wait = limits?.reset.take(email.toLowerCase());
    if (wait) return tooMany(c, wait, TOO_MANY_RESETS);
    const user = users.findByEmail(email);
    if (user) {
      const base = (publicUrl ?? c.req.header('origin') ?? new URL(c.req.url).origin).replace(/\/+$/, '');
      const link = `${base}/#reset=${users.startReset(user.id)}`;
      sendLater(mailer, {
        to: user.email,
        subject: 'Choose a new password for Code Blocks',
        text:
          `Someone asked to reset the password of the Code Blocks account for ${user.email}.\n\n` +
          `To choose a new password, open this link within ${RESET_MINUTES} minutes:\n${link}\n\n` +
          'If it wasn’t you, you can ignore this email. Your password stays the same.',
      });
    }
    // The same answer either way, so it doesn't tell who has an account.
    return c.json({ ok: true, message: mailer?.delivers ? RESET_SENT : `${RESET_SENT} ${NOT_DELIVERED}` });
  });

  app.post('/reset/finish', limit, async (c) => {
    const body = await readObject(c);
    const { token, password } = body ?? {};
    if (typeof token !== 'string' || typeof password !== 'string') return c.json(problem('Send { token, password } as JSON.'), 400);
    const bad = passwordProblem(password);
    if (bad) return c.json(problem(bad), 400);
    const user = await users.finishReset(token, password);
    if (!user) return c.json(problem(RESET_EXPIRED), 400);
    startSession(c, users, user, trustProxy);
    return c.json({ user });
  });

  /**
   * For changes to the signed-in account: the request's fields, after checking
   * the account's password. Wrong passwords count like failed sign-ins.
   */
  const withPassword = async (c: Context<AuthEnv>): Promise<{ user: User; body: Record<string, unknown> } | Response> => {
    const user = c.get('user');
    if (!user) return c.json(problem(SIGN_IN_NEEDED), 401);
    const body = await readObject(c);
    if (!body || typeof body.password !== 'string') return c.json(problem('Type your current password.'), 400);
    const key = `${limits?.addressOf(c) ?? ''} ${user.email}`;
    const wait = limits?.signIn.wait(key);
    if (wait) return tooMany(c, wait, TOO_MANY_SIGN_INS);
    if (!(await users.checkPassword(user.id, body.password))) {
      limits?.signIn.count(key);
      return c.json(problem(WRONG_PASSWORD), 403);
    }
    return { user, body };
  };

  app.post('/password', limit, async (c) => {
    const checked = await withPassword(c);
    if (checked instanceof Response) return checked;
    const { newPassword } = checked.body;
    if (typeof newPassword !== 'string') return c.json(problem('Type a new password.'), 400);
    const bad = passwordProblem(newPassword);
    if (bad) return c.json(problem(bad), 400);
    await users.setPassword(checked.user.id, newPassword, getCookie(c, SESSION_COOKIE));
    return c.json({ ok: true });
  });

  app.post('/email', limit, async (c) => {
    const checked = await withPassword(c);
    if (checked instanceof Response) return checked;
    const email = typeof checked.body.email === 'string' ? checked.body.email.trim() : '';
    const bad = emailProblem(email);
    if (bad) return c.json(problem(bad), 400);
    const user = users.setEmail(checked.user.id, email);
    if (!user) return c.json(problem(EMAIL_TAKEN), 409);
    if (user.email !== checked.user.email) {
      sendLater(mailer, {
        to: checked.user.email,
        subject: 'Your Code Blocks email was changed',
        text:
          `The email of your Code Blocks account was changed from ${checked.user.email} to ${user.email}. ` +
          'Sign in with the new email from now on.\n\n' +
          'If it wasn’t you, someone else knows your password. Ask whoever runs this Code Blocks server for help.',
      });
    }
    return c.json({ user });
  });

  app.delete('/account', limit, async (c) => {
    const checked = await withPassword(c);
    if (checked instanceof Response) return checked;
    deleteProjects?.(checked.user.id);
    users.remove(checked.user.id);
    deleteCookie(c, SESSION_COOKIE, { path: '/api' });
    return c.json({ ok: true });
  });

  app.post('/signout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) users.endSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/api' });
    return c.json({ ok: true });
  });

  return app;
}
