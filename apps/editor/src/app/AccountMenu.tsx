// The account button in the toolbar: sign in, make an account, or sign out.
// Signing in is optional; it's needed for the ☁ Server features.

import { useEffect, useRef, useState } from 'react';
import { openAccountMenu, signIn, signOut, useAuthStore } from '../data/authStore';

function SignInForm() {
  const [create, setCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setProblem(null);
    try {
      await signIn(email, password, create);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="account-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="menu-title">{create ? 'Create an account' : 'Sign in'}</div>
      <p className="hint">
        You can build and run apps without an account. Sign in to deploy server workflows, keep secrets and store table rows
        on the server.
      </p>
      <label className="field-label" htmlFor="account-email">
        Email
      </label>
      <input
        id="account-email"
        className="field-input"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
      />
      <label className="field-label" htmlFor="account-password">
        Password
      </label>
      <input
        id="account-password"
        className="field-input"
        type="password"
        autoComplete={create ? 'new-password' : 'current-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {create && <p className="hint">At least 8 characters.</p>}
      {problem && (
        <div className="field-problem" role="alert">
          ⚠ {problem}
        </div>
      )}
      <button className="btn run" type="submit" disabled={busy}>
        {create ? 'Create account' : 'Sign in'}
      </button>
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          setCreate(!create);
          setProblem(null);
        }}
      >
        {create ? 'I already have an account' : 'New here? Create an account'}
      </button>
    </form>
  );
}

export function AccountMenu() {
  const { status, user, menuOpen } = useAuthStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) openAccountMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openAccountMenu(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        className="btn account-btn"
        onClick={() => openAccountMenu(!menuOpen)}
        aria-expanded={menuOpen}
        title={user ? `Signed in as ${user.email}` : 'Sign in or create an account'}
      >
        👤 {user ? <span className="account-email">{user.email}</span> : 'Sign in'}
      </button>
      {menuOpen && (
        <div className="menu account-menu" role="dialog" aria-label="Account">
          {status === 'offline' ? (
            <p className="hint">Can’t reach the Code Blocks server, so you can’t sign in. Start it with “npm run dev:server”.</p>
          ) : user ? (
            <>
              <div className="menu-title">Account</div>
              <p>
                Signed in as <b>{user.email}</b>
              </p>
              <button className="btn" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <SignInForm />
          )}
        </div>
      )}
    </div>
  );
}
