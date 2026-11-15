// Sending email, such as password reset links. A hosted server sends it
// through an SMTP server (SMTP_HOST and the rest, read in main.ts). Without
// one, as when developing, each email is written to the server's log instead,
// and to MAIL_LOG_FILE when that's set (the end-to-end tests read it there).

import { appendFileSync } from 'node:fs';
import { createTransport } from 'nodemailer';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
  /** Whether emails really go out, rather than to the log. */
  readonly delivers: boolean;
}

export interface SmtpSettings {
  host: string;
  /** 587 (STARTTLS) by default; 465 connects over TLS. */
  port: number;
  user?: string;
  password?: string;
  /** Who the email comes from, like "Code Blocks <hello@example.com>". */
  from: string;
}

export class SmtpMailer implements Mailer {
  readonly delivers = true;
  private transport;

  constructor(private settings: SmtpSettings) {
    this.transport = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      // Never send passwords or reset links in the clear.
      requireTLS: settings.port !== 465,
      auth: settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined,
    });
  }

  async send({ to, subject, text }: Email) {
    await this.transport.sendMail({ from: this.settings.from, to, subject, text });
  }
}

/** Writes emails to the log (and a file), for development and tests. */
export class LogMailer implements Mailer {
  readonly delivers = false;

  constructor(private file?: string) {}

  async send(email: Email) {
    console.log(`Email to ${email.to}: ${email.subject}\n${email.text}\n`);
    if (this.file) appendFileSync(this.file, `${JSON.stringify(email)}\n`);
  }
}

/** Keeps emails in memory, for unit tests. It stands in for one that sends them. */
export class MemoryMailer implements Mailer {
  readonly delivers = true;
  sent: Email[] = [];

  async send(email: Email) {
    this.sent.push(email);
  }
}

/** The SMTP settings in the environment, or null when there are none. */
export function smtpFromEnv(env: Record<string, string | undefined>): SmtpSettings | null {
  if (!env.SMTP_HOST) return null;
  const port = Number(env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`SMTP_PORT must be a port number, not “${env.SMTP_PORT}”.`);
  if (!env.MAIL_FROM) throw new Error('Set MAIL_FROM, the address emails come from, along with SMTP_HOST.');
  return { host: env.SMTP_HOST, port, user: env.SMTP_USER, password: env.SMTP_PASSWORD, from: env.MAIL_FROM };
}
