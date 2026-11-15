// Starts the server. Settings come from the environment:
//   PORT, HOST      where it listens: 127.0.0.1:8787 by default, this computer only.
//                   Set HOST=0.0.0.0 to let other computers reach it.
//   DB_FILE         where accounts, projects, rows, deployments and secrets are kept:
//                   data/code-blocks.db (inside apps/server) by default; :memory: keeps
//                   them only while the server runs.
//   SECRETS_KEY     the key that encrypts secrets in the database (32 bytes, base64).
//                   Without it, a key is made in secrets.key next to DB_FILE.
//   STATIC_DIR      serve the editor's built files from here (--serve-editor: ../editor/dist).
//   TRUST_PROXY=1   behind a proxy: read the visitor's address and https from X-Forwarded-*.
//   RATE_LIMITS=off turn off the limits on sign-ins, sign-ups and requests (limits.ts).
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD, MAIL_FROM
//                   the SMTP server that sends password reset emails. Without SMTP_HOST,
//                   emails are written to the log (and to MAIL_LOG_FILE, when set).
//   PUBLIC_URL      where people open the editor, like https://blocks.example.com, for the
//                   links in emails. Needed with SMTP_HOST.
//   ALLOW_PRIVATE_ADDRESSES=1, or --allow-private-addresses: let projects send requests to
//                   this computer and its network (localhost, 192.168.…). Blocked by default,
//                   since a hosted server must not let projects reach its own network.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { openDatabase } from './db';
import { SqliteDeployments } from './deployments';
import { allowPrivateAddresses } from './http';
import { DEFAULT_LIMITS } from './limits';
import { LogMailer, smtpFromEnv, SmtpMailer } from './mailer';
import { SqliteProjects } from './projects';
import { SqlitePublications } from './publications';
import { SqliteRowStore } from './rows';
import { loadSecretsKey, SqliteSecrets } from './secrets';
import { createSite, EDITOR_DIST } from './site';
import { SqliteStore } from './store';
import { SqliteUsers } from './users';
import { Workflows } from './workflows';

const env = process.env;
const flag = (name: string) => process.argv.includes(`--${name}`);
const yes = (value: string | undefined) => !!value && !['0', 'false', 'no', 'off'].includes(value.toLowerCase());

const port = Number(env.PORT ?? 8787);
const hostname = env.HOST ?? '127.0.0.1';
const dbFile = env.DB_FILE ?? 'data/code-blocks.db';
const staticDir = env.STATIC_DIR || (flag('serve-editor') ? EDITOR_DIST : undefined);
const trustProxy = yes(env.TRUST_PROXY);
const limits = env.RATE_LIMITS?.toLowerCase() === 'off' ? undefined : DEFAULT_LIMITS;
const allowPrivate = yes(env.ALLOW_PRIVATE_ADDRESSES) || flag('allow-private-addresses');
allowPrivateAddresses(allowPrivate);
const smtp = smtpFromEnv(env);
const publicUrl = env.PUBLIC_URL || undefined;
if (smtp && !publicUrl) throw new Error('Set PUBLIC_URL, where people open the editor, so emails can link to it.');
const mailer = smtp ? new SmtpMailer(smtp) : new LogMailer(env.MAIL_LOG_FILE || undefined);

if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });
const db = openDatabase(dbFile);
const rows = new SqliteRowStore(db);
const store = new SqliteStore(db);
const secrets = new SqliteSecrets(db, loadSecretsKey(env.SECRETS_KEY, dbFile === ':memory:' ? null : join(dirname(dbFile), 'secrets.key')));
const deployments = new SqliteDeployments(db);
const users = new SqliteUsers(db);
const projects = new SqliteProjects(db);
const publications = new SqlitePublications(db);
const workflows = new Workflows({ deployments, store, rows, secrets });
workflows.start();

const api = createApp({ rows, store, secrets, workflows, users, projects, publications, limits, trustProxy, mailer, publicUrl });
const app = staticDir ? createSite(api, staticDir) : api;

serve({ fetch: app.fetch, port, hostname }, (info) => {
  const base = `http://${info.address}:${info.port}`;
  console.log(`Code Blocks server running at ${base}/api`);
  if (staticDir) console.log(`Editor: ${base}/ (from ${staticDir})`);
  console.log(`Data: ${dbFile === ':memory:' ? 'in memory' : dbFile}`);
  console.log(`Deployed projects: ${deployments.all().length}`);
  console.log(`Rate limits: ${limits ? 'on' : 'off'} · Requests to private addresses: ${allowPrivate ? 'allowed' : 'blocked'}`);
  console.log(smtp ? `Email: sent through ${smtp.host}:${smtp.port}` : 'Email: not sent, written to this log (set SMTP_HOST to send it)');
});
