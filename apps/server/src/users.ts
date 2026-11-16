// Accounts, sign-in sessions, and which account each project belongs to.
// Passwords are hashed with scrypt; sessions are random tokens kept in a
// cookie, and only their SHA-256 hashes are stored, so the database alone
// can't be used to sign in.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

export interface User {
  id: string;
  email: string;
}

/** How long a sign-in lasts. */
export const SESSION_DAYS = 30;
/** How long a password reset link works. */
export const RESET_MINUTES = 60;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

/** How hard scrypt works on each password. */
export const PASSWORD_COST = { N: 16384, r: 8, p: 1 };
let COST = PASSWORD_COST;
/** The cheaper cost the server's tests use. */
export const TEST_PASSWORD_COST = { N: 1024, r: 8, p: 1 };
/**
 * For the server's own tests only (see `testSetup.ts`): a cheaper cost, so
 * tests that sign in many times stay fast. Stored hashes keep the cost they
 * were made with, so they are always checked correctly.
 */
export function usePasswordCost(cost: typeof PASSWORD_COST) {
  COST = cost;
}
const KEY_LENGTH = 64;

/** A password as stored: `scrypt$N$r$p$salt$hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, N, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(key, expected);
}

const sha256 = (token: string) => createHash('sha256').update(token).digest('base64');

/** Normalizes an email for comparing and storing. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** A plain message when an email can't be used, or null. */
export function emailProblem(email: string): string | null {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Type your email address, like ada@example.com.';
  return null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `A password can be at most ${MAX_PASSWORD_LENGTH} characters long.`;
  return null;
}

export class SqliteUsers {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS project_owners (
        project_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        claimed_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      ) STRICT;
    `);
  }

  /** The account with this email, if there is one. */
  findByEmail(email: string): User | null {
    const row = this.db.prepare('SELECT id, email FROM users WHERE email = ?').get(normalizeEmail(email)) as User | undefined;
    return row ? { id: row.id, email: row.email } : null;
  }

  /** Whether the password is the account's. */
  async checkPassword(userId: string, password: string): Promise<boolean> {
    const row = this.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
    const ok = await checkPassword(password, row?.password_hash ?? dummyHash());
    return !!row && ok;
  }

  /**
   * Changes the password, and signs the account out everywhere except the
   * session `keep` (the one that changed it). Reset links stop working.
   */
  async setPassword(userId: string, password: string, keep?: string) {
    const hash = await hashPassword(password);
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, keep ? sha256(keep) : '');
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  }

  /** The account with its new email, or null when another account has it. Reset links sent before stop working. */
  setEmail(userId: string, email: string): User | null {
    const user = { id: userId, email: normalizeEmail(email) };
    try {
      this.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(user.email, userId);
    } catch (err) {
      if (String(err).includes('UNIQUE')) return null;
      throw err;
    }
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    return user;
  }

  /** Starts a password reset and returns its token, for the link. Links sent before stop working. */
  startReset(userId: string, now = Date.now()): string {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at <= ?').run(userId, now);
    this.db
      .prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sha256(token), userId, now + RESET_MINUTES * 60 * 1000);
    return token;
  }

  /**
   * Sets a new password with a reset link's token, which then stops working,
   * and signs the account out everywhere. Null when the token isn't valid.
   */
  async finishReset(token: string, password: string, now = Date.now()): Promise<User | null> {
    const row = this.db
      .prepare(
        'SELECT users.id, users.email, password_resets.expires_at FROM password_resets JOIN users ON users.id = password_resets.user_id WHERE token_hash = ?',
      )
      .get(sha256(token)) as { id: string; email: string; expires_at: number } | undefined;
    if (!row || row.expires_at <= now) return null;
    // Used up first, so the same link can't set two passwords.
    const used = this.db.prepare('DELETE FROM password_resets WHERE token_hash = ?').run(sha256(token));
    if (Number(used.changes) === 0) return null;
    await this.setPassword(row.id, password);
    return { id: row.id, email: row.email };
  }

  /** The projects the account owns. */
  projectsOf(userId: string): string[] {
    const rows = this.db.prepare('SELECT project_id FROM project_owners WHERE user_id = ?').all(userId) as { project_id: string }[];
    return rows.map((r) => r.project_id);
  }

  /** Deletes the account, its sessions and reset links, and which projects were its. */
  remove(userId: string) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM project_owners WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  /** The new account, or null when the email already has one. */
  async create(email: string, password: string): Promise<User | null> {
    const user = { id: randomBytes(9).toString('base64url'), email: normalizeEmail(email) };
    const hash = await hashPassword(password);
    try {
      this.db
        .prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(user.id, user.email, hash, new Date().toISOString());
    } catch (err) {
      if (String(err).includes('UNIQUE')) return null;
      throw err;
    }
    return user;
  }

  /** The account, if the email and password match one. */
  async verify(email: string, password: string): Promise<User | null> {
    const row = this.db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(normalizeEmail(email)) as
      | { id: string; email: string; password_hash: string }
      | undefined;
    // Hash anyway when there's no such account, so the answer takes as long either way.
    const ok = await checkPassword(password, row?.password_hash ?? dummyHash());
    return row && ok ? { id: row.id, email: row.email } : null;
  }

  /** Starts a session and returns its token, for the cookie. */
  startSession(userId: string, now = Date.now()): string {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sha256(token), userId, now + SESSION_DAYS * 24 * 60 * 60 * 1000);
    return token;
  }

  /** The signed-in account for a session token, if it's still valid. */
  sessionUser(token: string, now = Date.now()): User | null {
    const row = this.db
      .prepare(
        'SELECT users.id, users.email, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ?',
      )
      .get(sha256(token)) as { id: string; email: string; expires_at: number } | undefined;
    if (!row || row.expires_at <= now) return null;
    return { id: row.id, email: row.email };
  }

  endSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  /**
   * Whether the project may be used by the account. A project nobody has
   * used yet becomes theirs.
   */
  claimProject(projectId: string, userId: string): boolean {
    this.db
      .prepare('INSERT OR IGNORE INTO project_owners (project_id, user_id, claimed_at) VALUES (?, ?, ?)')
      .run(projectId, userId, new Date().toISOString());
    const row = this.db.prepare('SELECT user_id FROM project_owners WHERE project_id = ?').get(projectId) as { user_id: string };
    return row.user_id === userId;
  }
}

// A hash of a random password, checked against when an email has no account,
// so that takes as long as a wrong password. Made at today's cost.
const DUMMY_SALT = randomBytes(16).toString('base64');
const DUMMY_KEY = randomBytes(KEY_LENGTH).toString('base64');
const dummyHash = () => `scrypt$${COST.N}$${COST.r}$${COST.p}$${DUMMY_SALT}$${DUMMY_KEY}`;
