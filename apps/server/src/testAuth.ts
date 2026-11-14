// Signing in for the server's tests.

import type { createApp } from './app';

type App = ReturnType<typeof createApp>;
let n = 0;

/**
 * Makes an account on `app` and gives a request function that sends its
 * session cookie, so tests can use the routes that need signing in.
 */
export async function signedIn(app: App, email = `tester${++n}@example.com`) {
  const res = await app.request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse' }),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (res.status !== 200 || !cookie) throw new Error(`Couldn’t sign up: ${res.status}`);
  return (path: string, init: RequestInit = {}) =>
    // Sent like a browser would, from the editor's own address.
    app.request(path, { ...init, headers: { origin: 'http://localhost', ...(init.headers as Record<string, string>), cookie } });
}

const sessions = new WeakMap<App, ReturnType<typeof signedIn>>();

/** Like app.request, signed in to one account per app (made on first use). */
export function asUser(app: App) {
  return async (path: string, init: RequestInit = {}) => {
    let session = sessions.get(app);
    if (!session) sessions.set(app, (session = signedIn(app)));
    return (await session)(path, init);
  };
}
