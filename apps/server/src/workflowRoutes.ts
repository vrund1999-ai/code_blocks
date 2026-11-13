// Routes for deploying projects and starting their server workflows:
//   GET    /api/projects/:projectId/deployment   what the deployed copy answers to
//   PUT    /api/projects/:projectId/deployment   deploy { name, fingerprint, graph, variables, tables }
//   DELETE /api/projects/:projectId/deployment   stop the project's workflows
//   GET    /api/projects/:projectId/runs         the latest workflow runs
//   POST   /api/projects/:projectId/forms/:form  { values } from *Send form to server*
//   (any)  /api/hooks/:projectId/:path           a web address of the project

import { parseBody } from '@code-blocks/engine/nodes/web';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';
import { parseDeployRequest } from './validate';
import type { Workflows } from './workflows';

/** The biggest deployed project, form or web address call accepted. */
export const MAX_REQUEST_BYTES = 1024 * 1024;

const ID = /^[\w-]{1,64}$/;
const MAX_FORM_NAME = 100;

const problem = (message: string) => ({ error: { message } });

const limit = bodyLimit({
  maxSize: MAX_REQUEST_BYTES,
  onError: (c) => c.json(problem('The request is too big (over 1 MB).'), 413),
});

async function readJson(c: Context): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

const NOT_DEPLOYED = 'This project isn’t deployed. Deploy it from the editor (☁ Server) first.';

export function workflowRoutes(workflows: Workflows) {
  const app = new Hono();

  app.use('/:projectId/*', async (c, next) => {
    if (!ID.test(c.req.param('projectId'))) return c.json(problem('That project id is not valid.'), 400);
    await next();
  });

  app.get('/:projectId/deployment', (c) => {
    const summary = workflows.summary(c.req.param('projectId'));
    return summary ? c.json(summary) : c.json(problem(NOT_DEPLOYED), 404);
  });

  app.put('/:projectId/deployment', limit, async (c) => {
    const read = await readJson(c);
    if (!read.ok) return c.json(problem('The request body must be JSON.'), 400);
    const req = parseDeployRequest(read.body);
    if (typeof req === 'string') return c.json(problem(req), 400);
    return c.json(workflows.deploy(c.req.param('projectId'), req));
  });

  app.delete('/:projectId/deployment', (c) =>
    workflows.undeploy(c.req.param('projectId')) ? c.json({ ok: true }) : c.json(problem(NOT_DEPLOYED), 404),
  );

  app.get('/:projectId/runs', (c) => c.json({ runs: workflows.runs(c.req.param('projectId')) }));

  app.post('/:projectId/forms/:form', limit, async (c) => {
    const form = c.req.param('form');
    if (!form.trim() || form.length > MAX_FORM_NAME) return c.json(problem('That form name is not valid.'), 400);
    const read = await readJson(c);
    const values = read.ok ? (read.body as { values?: unknown })?.values : undefined;
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      return c.json(problem('Send the form as JSON: { "values": { … } }.'), 400);
    }
    const result = await workflows.sendForm(c.req.param('projectId'), form, values as Record<string, unknown>);
    if (!result) {
      return c.json(
        problem(`There’s no form “${form.trim()}” on the server. Add a “When form is sent” block for it, then deploy the project.`),
        404,
      );
    }
    return c.json({
      ok: result.ok,
      ...(result.error ? { error: result.error } : {}),
      messages: result.messages,
      reply: result.reply?.value ?? null,
    });
  });

  return app;
}

/** What a web address call sends: JSON and form posts become values; anything else stays text. */
function bodyOf(type: string, text: string): unknown {
  if (/application\/x-www-form-urlencoded/i.test(type)) return Object.fromEntries(new URLSearchParams(text));
  if (/json/i.test(type)) return parseBody(text);
  return text;
}

const NO_BODY = new Set([204, 205, 304]);

export function hookRoutes(workflows: Workflows) {
  const app = new Hono();

  app.all('/:projectId/:path{.+}', limit, async (c) => {
    const { projectId, path } = c.req.param();
    if (!ID.test(projectId)) return c.json(problem('That project id is not valid.'), 400);
    const method = c.req.method.toUpperCase();
    const text = method === 'GET' || method === 'HEAD' ? '' : await c.req.text();
    const result = await workflows.callAddress(projectId, method, path, {
      body: bodyOf(c.req.header('content-type') ?? '', text),
      query: c.req.query(),
      method,
    });
    if (!result) {
      return c.json(
        problem(
          `Nothing answers ${method} /${path} in this project. Check the address and the method, and deploy the project again if you changed it.`,
        ),
        404,
      );
    }
    if (!result.ok) return c.json(problem(`The workflow stopped: ${result.error?.message ?? 'something went wrong.'}`), 500);
    if (!result.reply) return c.json({ ok: true });
    const { value, status } = result.reply;
    if (NO_BODY.has(status)) return c.body(null, status as StatusCode);
    if (typeof value === 'string') return c.text(value, status as ContentfulStatusCode);
    return c.json(value ?? null, status as ContentfulStatusCode);
  });

  return app;
}
