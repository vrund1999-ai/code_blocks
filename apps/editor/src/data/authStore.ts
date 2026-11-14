// Who is signed in (apps/server/src/authRoutes.ts). Signing in is optional:
// guests can build and run apps in the browser, and the server features
// (deploying, secrets, data table rows, requests sent from the server) ask
// them to sign in.

import { create } from 'zustand';
import { pushToast } from '../runtime/runtimeStore';
import { call } from './api';

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
}

export const useAuthStore = create<AuthState>()(() => ({ status: 'checking', user: null, menuOpen: false }));

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

export async function signOut() {
  // Closed right away, so reopening it while this is under way isn't undone.
  useAuthStore.setState({ menuOpen: false });
  try {
    await call('/api/auth/signout', { method: 'POST' }, AUTH_OFFLINE);
    signedIn(null);
    pushToast('Signed out.');
  } catch (err) {
    pushToast((err as Error).message, 'error', 5000);
  }
}

export const openAccountMenu = (open = true) => useAuthStore.setState({ menuOpen: open });
