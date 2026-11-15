// Emails the test server would have sent. It has no SMTP server, so it writes
// them to OUTBOX (MAIL_LOG_FILE in playwright.config.ts), one JSON per line.

import { expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const OUTBOX = resolve('.e2e-outbox.jsonl');

export interface SentEmail {
  to: string;
  subject: string;
  text: string;
}

const sentTo = (to: string): SentEmail[] =>
  existsSync(OUTBOX)
    ? readFileSync(OUTBOX, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SentEmail)
        .filter((m) => m.to === to)
    : [];

/** The newest email sent to `to`, waiting for the `count`th to arrive. */
export async function lastEmail(to: string, count = 1): Promise<SentEmail> {
  await expect.poll(() => sentTo(to).length, { message: `waiting for email ${count} to ${to}` }).toBeGreaterThanOrEqual(count);
  return sentTo(to).at(-1)!;
}

/** The first link in an email. */
export const linkIn = (email: SentEmail) => /https?:\/\/\S+/.exec(email.text)![0];
