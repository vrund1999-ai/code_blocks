// Limits on how often something may happen, so a hosted server can't be used
// to guess passwords, make piles of accounts, or flood other sites with
// requests. Counts are kept in memory, so they start over when the server
// restarts.

import type { Context, MiddlewareHandler } from 'hono';
import type { AuthEnv } from './authRoutes';

export interface Limit {
  /** How many times it may happen in each window. */
  count: number;
  /** The window, in seconds. */
  seconds: number;
}

export interface Limits {
  /** Failed sign-ins, per address and email. */
  signIn: Limit;
  /** New accounts, per address. */
  signUp: Limit;
  /** Requests sent through the server (POST /api/fetch), per account. */
  fetch: Limit;
  /** Test runs from the editor (POST /api/run), per account. */
  run: Limit;
  /** Calls to a project's web addresses and forms, per project. */
  workflow: Limit;
}

export const DEFAULT_LIMITS: Limits = {
  signIn: { count: 10, seconds: 15 * 60 },
  signUp: { count: 5, seconds: 60 * 60 },
  fetch: { count: 60, seconds: 60 },
  run: { count: 60, seconds: 60 },
  workflow: { count: 120, seconds: 60 },
};

/** Counts up to `limit.count` per key in each window of `limit.seconds`. */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    readonly limit: Limit,
    private now: () => number = Date.now,
  ) {}

  /** Seconds until `key` may try again, or 0 when it may now. */
  wait(key: string): number {
    const w = this.windows.get(key);
    const ms = this.limit.seconds * 1000;
    if (!w || this.now() - w.start >= ms) return 0;
    return w.count >= this.limit.count ? Math.ceil((w.start + ms - this.now()) / 1000) : 0;
  }

  /** Counts one for `key`. */
  count(key: string) {
    const now = this.now();
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.limit.seconds * 1000) {
      this.windows.set(key, { start: now, count: 1 });
      if (this.windows.size > 10_000) this.forgetOld();
    } else {
      w.count++;
    }
  }

  /** Counts one for `key`, unless it's over the limit. Returns the seconds to wait, or 0. */
  take(key: string): number {
    const wait = this.wait(key);
    if (!wait) this.count(key);
    return wait;
  }

  private forgetOld() {
    const ms = this.limit.seconds * 1000;
    for (const [key, w] of this.windows) if (this.now() - w.start >= ms) this.windows.delete(key);
  }
}

/** "a minute", "3 minutes", "an hour"… for the messages. */
export function waitText(seconds: number): string {
  if (seconds < 60) return seconds <= 1 ? 'a second' : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes === 1 ? 'a minute' : `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}

/** The 429 answer, with Retry-After. */
export function tooMany(c: Context, wait: number, message: string) {
  c.header('Retry-After', String(wait));
  return c.json({ error: { message: `${message} Try again in ${waitText(wait)}.` } }, 429);
}

/**
 * Where the request came from. Behind a proxy (TRUST_PROXY), that's the first
 * address in X-Forwarded-For; otherwise the connection's own address.
 */
export function clientAddress(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}

/** Refuses a request with 429 when its key is over the limit. */
export function rateLimit(
  limiter: RateLimiter,
  keyOf: (c: Context<AuthEnv>) => string,
  message: string,
): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const wait = limiter.take(keyOf(c));
    if (wait) return tooMany(c, wait, message);
    await next();
  };
}
