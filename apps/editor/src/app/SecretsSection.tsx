// The Secrets part of the ☁ Server menu: add, replace and delete the
// project's secrets (such as API keys). The server keeps the values and never
// sends them back, so only the names are listed.

import { useEffect, useRef, useState } from 'react';
import { MIN_SECRET_LENGTH, SECRET_NAME, SECRET_NAME_PROBLEM } from '@code-blocks/engine/nodes/server';
import { deleteSecret, listSecrets, saveSecret, type SecretInfo } from '../data/serverApi';
import { pushToast } from '../runtime/runtimeStore';

const day = (iso: string) => new Date(iso).toLocaleDateString();

export function SecretsSection({ projectId }: { projectId: string }) {
  const [secrets, setSecrets] = useState<SecretInfo[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  const load = () =>
    listSecrets(projectId).then(
      (s) => {
        setSecrets(s);
        setOffline(false);
      },
      () => setOffline(true),
    );

  useEffect(() => {
    setSecrets(null);
    void load();
  }, [projectId]);

  const exists = (n: string) => secrets?.some((s) => s.name.toLowerCase() === n.trim().toLowerCase());

  async function save() {
    const n = name.trim();
    if (!SECRET_NAME.test(n)) return setProblem(SECRET_NAME_PROBLEM);
    if (value.trim().length < MIN_SECRET_LENGTH) return setProblem(`A secret must be at least ${MIN_SECRET_LENGTH} characters long.`);
    setBusy(true);
    try {
      const replaced = exists(n);
      await saveSecret(projectId, n, value);
      pushToast(replaced ? `Replaced the secret “${n}”.` : `Saved the secret “${n}”.`);
      setName('');
      setValue('');
      setProblem(null);
      await load();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(n: string) {
    setDeleting(null);
    try {
      await deleteSecret(projectId, n);
      pushToast(`Deleted the secret “${n}”.`);
      await load();
    } catch (err) {
      pushToast((err as Error).message, 'error', 5000);
    }
  }

  return (
    <section className="server-secrets" aria-label="Secrets">
      <div className="menu-title">Secrets</div>
      <p className="hint">
        Keep API keys and passwords here instead of in your blocks. The server keeps them and never shows them again.
        Read them with the “Secret” block in server workflows; they never reach the app.
      </p>
      {offline ? null : secrets === null ? (
        <p className="hint">Loading…</p>
      ) : secrets.length > 0 ? (
        <ul className="server-list" aria-label="Saved secrets">
          {secrets.map((s) => (
            <li key={s.name}>
              <code>{s.name}</code> <span className="hint">set {day(s.updatedAt)}</span>
              <span className="secret-actions">
                {deleting === s.name ? (
                  <>
                    <button className="link-btn danger" onClick={() => void remove(s.name)}>
                      Really delete
                    </button>
                    <button className="link-btn" onClick={() => setDeleting(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="link-btn"
                      aria-label={`Replace ${s.name}`}
                      onClick={() => {
                        setName(s.name);
                        setValue('');
                        valueRef.current?.focus();
                      }}
                    >
                      Replace
                    </button>
                    <button className="link-btn" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s.name)}>
                      Delete
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">No secrets yet.</p>
      )}
      {!offline && (
        <form
          className="secret-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            className="field-input"
            aria-label="Secret name"
            placeholder="Name, like WEATHER_KEY"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            ref={valueRef}
            className="field-input"
            type="password"
            aria-label="Secret value"
            placeholder="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="new-password"
          />
          <button className="btn" type="submit" disabled={busy}>
            {exists(name) ? 'Replace' : 'Add secret'}
          </button>
        </form>
      )}
      {problem && (
        <div className="field-problem" role="alert">
          ⚠ {problem}
        </div>
      )}
    </section>
  );
}
