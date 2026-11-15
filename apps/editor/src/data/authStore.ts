// Who is signed in (apps/server/src/authRoutes.ts). Signing in is optional:
// guests can build and run apps in the browser, and the server features
// (deploying, secrets, data table rows, requests sent from the server) ask
// them to sign in. Also resetting a forgotten password, and the account's
// settings.

import { create } from 'zustand';
import { pushToast } from '../runtime/runtimeStore';
import { call, requestsSettled } from './api';

export interface User {
  id: string;
  email: string;
}

export type AuthStatus = 'checking' | 'guest' | 'signed-in' | 'offline';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** The account menu in the toolbar is open. */
  menuOpen: boolean;
  /** From a password reset link (/#reset=…): the account menu asks for a new password. */
  resetToken: string | null;
}

/**
 * The token of a password reset link the editor was opened with. It's taken
 * out of the address, so it isn't left in the browser's history.
 */
function takeResetToken(): string | null {
  if (typeof location === 'undefined') return null;
  const token = /^#reset=([\w-]+)$/.exec(location.hash)?.[1] ?? null;
  if (token) history.replaceState(null, '', location.pathname + location.search);
  return token;
}

const resetToken = takeResetToken();

export const useAuthStore = create<AuthState>()(() => ({ status: 'checking', user: null, menuOpen: !!resetToken, resetToken }));

// A link opened in a tab where the editor is already open only changes the
// address's #, without loading the page again.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const token = takeResetToken();
    if (token) useAuthStore.setState({ resetToken: token, menuOpen: true });
  });
}

export const AUTH_OFFLINE = 'Can’t reach the Code Blocks server, so you can’t sign in. Start it with “npm run dev:server”.';

const signedIn = (user: User | null) =>
  useAuthStore.setState(user ? { status: 'signed-in', user } : { status: 'guest', user: null });

/** Asks the server who is signed in. */
export async function refreshAuth() {
  try {
    signedIn((await call<{ user: User | null }>('/api/auth/me', {}, AUTH_OFFLINE)).user);
  } catch {
    useAuthStore.setState({ status: 'offline', user: null });
  }
}

/** Signs in, or makes an account when `create` is set. Rejects with a message to show. */
export async function signIn(email: string, password: string, create = false) {
  const { user } = await call<{ user: User }>(
    `/api/auth/${create ? 'signup' : 'signin'}`,
    { method: 'POST', body: JSON.stringify({ email, password }) },
    AUTH_OFFLINE,
  );
  signedIn(user);
  useAuthStore.setState({ menuOpen: false });
  pushToast(create ? `Welcome! You’re signed in as ${user.email}.` : `Signed in as ${user.email}.`);
}

/** Run before signing out, such as to send a change that's waiting to be saved. */
const beforeSignOut: (() => void)[] = [];
export const onBeforeSignOut = (fn: () => void) => void beforeSignOut.push(fn);

export async function signOut() {
  // Closed right away, so reopening it while this is under way isn't undone.
  useAuthStore.setState({ menuOpen: false });
  for (const fn of beforeSignOut) fn();
  // Requests sent before, such as a save, are answered while still signed in.
  await requestsSettled();
  try {
    await call('/api/auth/signout', { method: 'POST' }, AUTH_OFFLINE);
    signedIn(null);
    pushToast('Signed out.');
  } catch (err) {
    pushToast((err as Error).message, 'error', 5000);
  }
}

export const openAccountMenu = (open = true) => useAuthStore.setState({ menuOpen: open });

const post = <T>(path: string, body: unknown, method = 'POST') =>
  call<T>(`/api/auth/${path}`, { method, body: JSON.stringify(body) }, AUTH_OFFLINE);

/** Asks for a password reset link by email. Resolves with the message to show. */
export async function requestReset(email: string): Promise<string> {
  return (await post<{ message: string }>('reset', { email })).message;
}

/** Sets a new password with the reset link the editor was opened with, and signs in. */
export async function finishReset(password: string) {
  const token = useAuthStore.getState().resetToken;
  const { user } = await post<{ user: User }>('reset/finish', { token, password });
  signedIn(user);
  useAuthStore.setState({ menuOpen: false, resetToken: null });
  pushToast(`Your new password is saved. You’re signed in as ${user.email}.`);
}

/** Leaves the reset link's form. */
export const cancelReset = () => useAuthStore.setState({ resetToken: null });

/** Your other browsers are signed out. */
export async function changePassword(password: string, newPassword: string) {
  await post('password', { password, newPassword });
  pushToast('Your password was changed. Other browsers were signed out.');
}

export async function changeEmail(password: string, email: string) {
  const { user } = await post<{ user: User }>('email', { password, email });
  signedIn(user);
  pushToast(`Your email is now ${user.email}.`);
}

/** Deletes the account, with its projects on the server and their rows, secrets and published apps. */
export async function deleteAccount(password: string) {
  // A save under way is answered first, so it can't save a project after its account is gone.
  await requestsSettled();
  await post('account', { password }, 'DELETE');
  signedIn(null);
  useAuthStore.setState({ menuOpen: false });
  pushToast('Your account was deleted.');
}
