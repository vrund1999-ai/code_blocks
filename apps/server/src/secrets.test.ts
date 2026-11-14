import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { openDatabase } from './db';
import { SqliteRowStore } from './rows';
import { runGraph } from './run';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { HIDDEN, loadSecretsKey, redact, SqliteSecrets, WRONG_KEY } from './secrets';
import { MemoryStore } from './store';
import { data, exec, node } from './testGraph';
import { asUser } from './testAuth';

const secretStore = () => new SqliteSecrets(openDatabase(':memory:'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('secret store', () => {
  it('keeps secrets per project, matched ignoring case, and lists names only', () => {
    const s = secretStore();
    s.set('p1', 'Weather_Key', 'abcd1234');
    s.set('p1', 'A_KEY', 'zzzz9999');
    s.set('p2', 'Weather_Key', 'other-project');
    expect(s.get('p1', 'weather_key')).toBe('abcd1234');
    expect(s.list('p1').map((x) => x.name)).toEqual(['A_KEY', 'Weather_Key']);
    expect(JSON.stringify(s.list('p1'))).not.toContain('abcd1234');

    // Setting it again replaces the value, and takes the new spelling of the name.
    s.set('p1', 'WEATHER_KEY', 'new-value');
    expect(s.get('p1', 'Weather_Key')).toBe('new-value');
    expect(s.list('p1').map((x) => x.name)).toEqual(['A_KEY', 'WEATHER_KEY']);

    expect(s.remove('p1', 'weather_KEY')).toBe(true);
    expect(s.remove('p1', 'weather_KEY')).toBe(false);
    expect(s.get('p1', 'Weather_Key')).toBeUndefined();
    expect(s.get('p2', 'Weather_Key')).toBe('other-project');
  });
});

describe('secrets in the database', () => {
  const stored = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare('SELECT value FROM secrets').all() as { value: string }[]).map((r) => r.value);

  it('are encrypted, and need the same key to be read', () => {
    const db = openDatabase(':memory:');
    const key = randomBytes(32);
    new SqliteSecrets(db, key).set('p1', 'API_KEY', 'abcd1234');
    expect(stored(db)[0]).toMatch(/^enc1:/);
    expect(stored(db)[0]).not.toContain('abcd1234');

    expect(new SqliteSecrets(db, key).get('p1', 'API_KEY')).toBe('abcd1234');
    expect(() => new SqliteSecrets(db, randomBytes(32))).toThrow(WRONG_KEY);
  });

  it('can’t be moved to another project', () => {
    const db = openDatabase(':memory:');
    const secrets = new SqliteSecrets(db);
    secrets.set('p1', 'API_KEY', 'abcd1234');
    db.prepare("UPDATE secrets SET project_id = 'p2'").run();
    expect(() => secrets.get('p2', 'API_KEY')).toThrow(WRONG_KEY);
  });

  it('saved before encryption are encrypted when the server starts', () => {
    const db = openDatabase(':memory:');
    db.exec(`CREATE TABLE secrets (project_id TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE, value TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY (project_id, name)) STRICT`);
    db.prepare("INSERT INTO secrets VALUES ('p1', 'API_KEY', 'plain-value', '2026-01-01T00:00:00.000Z')").run();
    const secrets = new SqliteSecrets(db);
    expect(stored(db)[0]).toMatch(/^enc1:/);
    expect(secrets.get('p1', 'api_key')).toBe('plain-value');
  });

  it('use SECRETS_KEY, or a key file made the first time', () => {
    const env = randomBytes(32).toString('base64');
    expect(loadSecretsKey(env, null).toString('base64')).toBe(env);
    expect(() => loadSecretsKey('too-short', null)).toThrow('The secrets key must be 32 bytes, written as base64.');

    const dir = mkdtempSync(join(tmpdir(), 'cb-key-'));
    try {
      const file = join(dir, 'secrets.key');
      const made = loadSecretsKey(undefined, file);
      expect(readFileSync(file, 'utf8').trim()).toBe(made.toString('base64'));
      expect(loadSecretsKey(undefined, file).equals(made)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('redact', () => {
  it('hides secrets in text at any depth, longest first', () => {
    const secrets = new Set(['abcd', 'abcd1234']);
    expect(redact({ a: ['key=abcd1234!', { abcd: 'abcd' }], n: 3, ok: true, none: null }, secrets)).toEqual({
      a: [`key=${HIDDEN}!`, { [HIDDEN]: HIDDEN }],
      n: 3,
      ok: true,
      none: null,
    });
    const same = { a: 'abcd' };
    expect(redact(same, new Set())).toBe(same);
  });
});

describe('runs that read secrets', () => {
  it('use the real value, and hide it in everything they send back', async () => {
    const fetchMock = vi.fn(async () => new Response('"sunny"', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const secrets = secretStore();
    secrets.set('p1', 'WEATHER_KEY', 'abcd1234');

    const result = await runGraph(
      {
        graph: {
          nodes: [
            node('hook', 'server.http', { path: 'weather' }),
            node('key', 'server.secret', { name: 'WEATHER_KEY' }),
            node('url', 'data.join', { a: 'https://api.example.com/?key=' }),
            node('get', 'action.fetch'),
            node('msg', 'action.toast'),
            node('save', 'action.setVariable', { variable: 'k' }),
            node('reply', 'server.reply'),
          ],
          edges: [
            exec('hook', 'get'),
            exec('get', 'msg'),
            exec('msg', 'save'),
            exec('save', 'reply'),
            data('key', 'value', 'url', 'b'),
            data('url', 'value', 'get', 'url'),
            data('url', 'value', 'msg', 'message'),
            data('key', 'value', 'save', 'value'),
            data('url', 'value', 'reply', 'value'),
          ],
        },
        nodeId: 'hook',
        payload: { body: '', query: {}, method: 'GET' },
        variables: [{ id: 'k', type: 'text', initial: '' }],
        tables: [],
        projectId: 'p1',
      },
      { store: new MemoryStore(), rows: new SqliteRowStore(':memory:'), secrets, replies: true },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/?key=abcd1234', expect.anything());
    expect(result.ok).toBe(true);
    expect(result.messages).toEqual([`https://api.example.com/?key=${HIDDEN}`]);
    expect(result.vars.k).toBe(HIDDEN);
    expect(result.reply?.value).toBe(`https://api.example.com/?key=${HIDDEN}`);
    expect(JSON.stringify(result)).not.toContain('abcd1234');
  });

  it('say which secret is missing', async () => {
    const result = await runGraph(
      {
        graph: {
          nodes: [node('start', 'server.schedule'), node('key', 'server.secret', { name: 'NOPE' }), node('msg', 'action.toast')],
          edges: [exec('start', 'msg'), data('key', 'value', 'msg', 'message')],
        },
        nodeId: 'start',
        payload: {},
        variables: [],
        tables: [],
        projectId: 'p1',
      },
      { store: new MemoryStore(), rows: new SqliteRowStore(':memory:') },
    );
    expect(result.error).toEqual({ nodeId: 'key', message: 'There’s no secret “NOPE” on the server. Add it in ☁ Server → Secrets.' });
  });
});

describe('secret routes', () => {
  const app = () => createApp({ secrets: secretStore() });
  const put = (a: ReturnType<typeof app>, name: string, body: unknown) =>
    asUser(a)(`/api/projects/p1/secrets/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('adds, lists (without values) and deletes secrets', async () => {
    const a = app();
    const saved = await put(a, 'API_KEY', { value: '  abcd1234  ' });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ name: 'API_KEY' });

    const list = await asUser(a)('/api/projects/p1/secrets');
    const text = await list.text();
    expect(JSON.parse(text).secrets).toEqual([{ name: 'API_KEY', updatedAt: expect.any(String) }]);
    expect(text).not.toContain('abcd1234');

    expect((await asUser(a)('/api/projects/p1/secrets/api_key', { method: 'DELETE' })).status).toBe(200);
    const gone = await asUser(a)('/api/projects/p1/secrets/api_key', { method: 'DELETE' });
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: { message: 'There’s no secret “api_key”.' } });
  });

  it.each([
    ['a bad name', 'my key', { value: 'abcd1234' }, /letters, numbers and _/],
    ['a name starting with a number', '2KEY', { value: 'abcd1234' }, /starting with a letter/],
    ['no value', 'KEY', {}, /Send the secret as JSON/],
    ['a short value', 'KEY', { value: ' ab ' }, 'A secret must be at least 4 characters long.'],
    ['a long value', 'KEY', { value: 'x'.repeat(10_001) }, 'A secret can be at most 10,000 characters long.'],
  ])('refuses %s', async (_, name, body, message) => {
    const res = await put(app(), name, body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(message);
  });

  it('lets tried runs use the project’s secrets', async () => {
    const a = app();
    await put(a, 'GREETING', { value: 'hello there' });
    const res = await asUser(a)('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graph: {
          nodes: [node('start', 'server.schedule'), node('key', 'server.secret', { name: 'greeting' }), node('msg', 'action.toast')],
          edges: [exec('start', 'msg'), data('key', 'value', 'msg', 'message')],
        },
        nodeId: 'start',
        projectId: 'p1',
      }),
    });
    expect(await res.json()).toMatchObject({ ok: true, messages: [HIDDEN] });
  });
});
