// The account button in the toolbar: sign in, make an account, reset a
// forgotten password, or change the account's settings. Signing in is
// optional; it's needed for the ☁ Server features.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  cancelReset,
  changeEmail,
  changePassword,
  deleteAccount,
  finishReset,
  openAccountMenu,
  requestReset,
  signIn,
  signOut,
  useAuthStore,
} from '../data/authStore';

/** A labelled input, with an id made from `id`. */
function Field({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  label: string;
  type: 'email' | 'password';
  autoComplete: string;
  value: string;
  onChange(v: string): void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field-input"
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
    </>
  );
}

/** A form that runs `action` when sent, showing its problem if it fails. */
function AccountForm({
  title,
  children,
  submit,
  action,
  danger,
  footer,
}: {
  title: string;
  children: ReactNode;
  submit: string;
  action(): Promise<void>;
  danger?: boolean;
  footer?: ReactNode;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="account-form"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setProblem(null);
        action()
          .catch((err: Error) => setProblem(err.message))
          .finally(() => setBusy(false));
      }}
    >
      <div className="menu-title">{title}</div>
      {children}
      {problem && (
        <div className="field-problem" role="alert">
          ⚠ {problem}
        </div>
      )}
      <button className={`btn ${danger ? 'danger' : 'run'}`} type="submit" disabled={busy}>
        {submit}
      </button>
      {footer}
    </form>
  );
}

const PASSWORD_HINT = <p className="hint">At least 8 characters.</p>;

function SignInForm() {
  const [mode, setMode] = useState<'signin' | 'create' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const switchTo = (to: typeof mode) => {
    setMode(to);
    setSent(null);
  };

  if (mode === 'forgot') {
    return (
      <AccountForm
        key="forgot"
        title="Forgot your password?"
        submit="Email me a link"
        action={async () => setSent(await requestReset(email))}
        footer={
          <button type="button" className="link-btn" onClick={() => switchTo('signin')}>
            Back to sign in
          </button>
        }
      >
        <p className="hint">We’ll email you a link to choose a new password.</p>
        <Field id="account-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} autoFocus />
        {sent && (
          <p className="account-sent" role="status">
            {sent}
          </p>
        )}
      </AccountForm>
    );
  }

  const create = mode === 'create';
  return (
    <AccountForm
      key={mode}
      title={create ? 'Create an account' : 'Sign in'}
      submit={create ? 'Create account' : 'Sign in'}
      action={() => signIn(email, password, create)}
      footer={
        <>
          {!create && (
            <button type="button" className="link-btn" onClick={() => switchTo('forgot')}>
              Forgot your password?
            </button>
          )}
          <button type="button" className="link-btn" onClick={() => switchTo(create ? 'signin' : 'create')}>
            {create ? 'I already have an account' : 'New here? Create an account'}
          </button>
        </>
      }
    >
      <p className="hint">
        You can build and run apps without an account. Sign in to deploy server workflows, keep secrets and store table rows
        on the server.
      </p>
      <Field id="account-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} autoFocus />
      <Field
        id="account-password"
        label="Password"
        type="password"
        autoComplete={create ? 'new-password' : 'current-password'}
        value={password}
        onChange={setPassword}
      />
      {create && PASSWORD_HINT}
    </AccountForm>
  );
}

/** Opened from a password reset link. */
function ResetForm() {
  const [password, setPassword] = useState('');
  return (
    <AccountForm
      title="Choose a new password"
      submit="Save new password"
      action={() => finishReset(password)}
      footer={
        <button type="button" className="link-btn" onClick={cancelReset}>
          Cancel
        </button>
      }
    >
      <p className="hint">Other browsers signed in to this account will be signed out.</p>
      <Field
        id="account-new-password"
        label="New password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        autoFocus
      />
      {PASSWORD_HINT}
    </AccountForm>
  );
}

type Setting = 'password' | 'email' | 'delete';

function AccountSettings({ email }: { email: string }) {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [current, setCurrent] = useState('');
  const [value, setValue] = useState('');
  const open = (s: Setting | null) => {
    setSetting(s);
    setCurrent('');
    setValue('');
  };
  const back = (
    <button type="button" className="link-btn" onClick={() => open(null)}>
      Cancel
    </button>
  );
  const currentField = (
    <Field
      id="account-current-password"
      label="Current password"
      type="password"
      autoComplete="current-password"
      value={current}
      onChange={setCurrent}
      autoFocus
    />
  );

  if (setting === 'password') {
    return (
      <AccountForm
        title="Change password"
        submit="Change password"
        action={async () => {
          await changePassword(current, value);
          open(null);
        }}
        footer={back}
      >
        {currentField}
        <Field id="account-new-password" label="New password" type="password" autoComplete="new-password" value={value} onChange={setValue} />
        {PASSWORD_HINT}
        <p className="hint">Other browsers signed in to this account will be signed out.</p>
      </AccountForm>
    );
  }
  if (setting === 'email') {
    return (
      <AccountForm
        title="Change email"
        submit="Change email"
        action={async () => {
          await changeEmail(current, value);
          open(null);
        }}
        footer={back}
      >
        {currentField}
        <Field id="account-new-email" label="New email" type="email" autoComplete="email" value={value} onChange={setValue} />
        <p className="hint">We’ll let {email} know it was changed.</p>
      </AccountForm>
    );
  }
  if (setting === 'delete') {
    return (
      <AccountForm title="Delete your account?" submit="Delete my account" danger action={() => deleteAccount(current)} footer={back}>
        <p className="account-warning">
          This deletes your account and everything it keeps on the server: your saved projects, their table rows and secrets,
          deployed server workflows and published apps. It can’t be undone.
        </p>
        <p className="hint">The project open here stays in this browser.</p>
        {currentField}
      </AccountForm>
    );
  }
  return (
    <>
      <div className="menu-title">Account</div>
      <p>
        Signed in as <b>{email}</b>
      </p>
      <div className="account-actions">
        <button className="btn" onClick={() => open('password')}>
          Change password
        </button>
        <button className="btn" onClick={() => open('email')}>
          Change email
        </button>
        <button className="btn" onClick={() => void signOut()}>
          Sign out
        </button>
        <button className="btn danger" onClick={() => open('delete')}>
          Delete account…
        </button>
      </div>
    </>
  );
}

export function AccountMenu() {
  const { status, user, menuOpen, resetToken } = useAuthStore();
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
          ) : resetToken ? (
            <ResetForm />
          ) : user ? (
            <AccountSettings key={user.id} email={user.email} />
          ) : (
            <SignInForm />
          )}
        </div>
      )}
    </div>
  );
}
