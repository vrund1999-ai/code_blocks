import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogMailer, smtpFromEnv } from './mailer';

afterEach(() => vi.restoreAllMocks());

describe('email settings', () => {
  it('send through SMTP only when SMTP_HOST is set, with MAIL_FROM', () => {
    expect(smtpFromEnv({})).toBeNull();
    expect(() => smtpFromEnv({ SMTP_HOST: 'smtp.example.com' })).toThrow(/MAIL_FROM/);
    expect(() => smtpFromEnv({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: 'twenty', MAIL_FROM: 'a@example.com' })).toThrow(/SMTP_PORT/);
    expect(smtpFromEnv({ SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'Blocks <a@example.com>', SMTP_USER: 'u', SMTP_PASSWORD: 'p' })).toEqual({
      host: 'smtp.example.com',
      port: 587,
      user: 'u',
      password: 'p',
      from: 'Blocks <a@example.com>',
    });
  });

  it('otherwise write emails to the log, and to MAIL_LOG_FILE', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mail-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const file = join(dir, 'outbox.jsonl');
      const mailer = new LogMailer(file);
      expect(mailer.delivers).toBe(false);
      await mailer.send({ to: 'ada@example.com', subject: 'Hi', text: 'Hello' });
      await mailer.send({ to: 'bo@example.com', subject: 'Hi', text: 'Hello' });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Email to ada@example.com: Hi'));
      expect(readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l).to)).toEqual(['ada@example.com', 'bo@example.com']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
