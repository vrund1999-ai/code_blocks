import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { NOT_YOURS, SIGN_IN_NEEDED } from './authRoutes';
import { NO_SUCH_TABLE, NOT_PUBLISHED } from './publishRoutes';
import { signedIn } from './testAuth';

const project = (id: string, name = 'Guest list') => ({
  version: 2,
  id,
  name,
  screens: [{ id: 's1', name: 'Home', root: { id: 'r1', type: 'container', name: 'Screen', props: {}, children: [] } }],
  variables: [],
  tables: [{ id: 't1', name: 'Guests', columns: [{ id: 'c1', name: 'Name', type: 'text' }] }],
  graph: { nodes: [], edges: [] },
});

const send = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const errorOf = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message;

type Info = { published: boolean; slug: string; publishedAt: string; fingerprint: string };

describe('published apps', () => {
  it('get a link that stays the same when published again, and can be taken down', async () => {
    const app = createApp();
    const ada = await signedIn(app);
    expect(await (await ada('/api/projects/p1/publication')).json()).toEqual({ published: false });

    const first = (await (await ada('/api/projects/p1/publication', send('PUT', { project: project('p1'), fingerprint: 'a' }))).json()) as Info;
    expect(first).toMatchObject({ published: true, projectId: 'p1', fingerprint: 'a' });
    expect(first.slug).toMatch(/^[\w-]{12}$/);

    // Anyone with the link can open it, signed in or not.
    const opened = await app.request(`/api/published/${first.slug}`);
    expect(opened.status).toBe(200);
    expect(((await opened.json()) as { project: { name: string } }).project.name).toBe('Guest list');

    const again = (await (
      await ada('/api/projects/p1/publication', send('PUT', { project: project('p1', 'Party guests'), fingerprint: 'b' }))
    ).json()) as Info;
    expect(again.slug).toBe(first.slug);
    expect(await (await ada('/api/projects/p1/publication')).json()).toMatchObject({ published: true, fingerprint: 'b' });
    const reopened = (await (await app.request(`/api/published/${first.slug}`)).json()) as { project: { name: string } };
    expect(reopened.project.name).toBe('Party guests');

    expect((await ada('/api/projects/p1/publication', { method: 'DELETE' })).status).toBe(200);
    const gone = await app.request(`/api/published/${first.slug}`);
    expect(gone.status).toBe(404);
    expect(await errorOf(gone)).toBe(NOT_PUBLISHED);
  });

  it('let visitors read the rows of their tables, and nothing else', async () => {
    const app = createApp();
    const ada = await signedIn(app);
    await ada('/api/projects/p1/tables/t1/rows', send('POST', { values: { c1: 'Ada' } }));
    await ada('/api/projects/p1/tables/t2/rows', send('POST', { values: { c1: 'Not in the app' } }));
    const { slug } = (await (await ada('/api/projects/p1/publication', send('PUT', { project: project('p1'), fingerprint: 'a' }))).json()) as Info;

    const rows = await app.request(`/api/published/${slug}/tables/t1/rows`);
    expect(await rows.json()).toEqual({ rows: [{ id: 1, values: { c1: 'Ada' } }], total: 1 });
    const other = await app.request(`/api/published/${slug}/tables/t2/rows`);
    expect(other.status).toBe(404);
    expect(await errorOf(other)).toBe(NO_SUCH_TABLE);

    // Changing rows still needs the owner's account.
    for (const [path, init] of [
      [`/api/published/${slug}/tables/t1/rows`, send('POST', { values: { c1: 'Bo' } })],
      ['/api/projects/p1/tables/t1/rows', send('POST', { values: { c1: 'Bo' } })],
      ['/api/projects/p1/tables/t1/rows/1', { method: 'DELETE' }],
    ] as const) {
      const res = await app.request(path, init);
      expect(res.status, path).not.toBe(200);
      expect(res.status, path).not.toBe(201);
    }
    expect(((await (await app.request(`/api/published/${slug}/tables/t1/rows`)).json()) as { total: number }).total).toBe(1);
  });

  it('are published only by the project’s account, and checked first', async () => {
    const app = createApp();
    const ada = await signedIn(app);
    const bo = await signedIn(app);
    await ada('/api/projects/p1/publication', send('PUT', { project: project('p1'), fingerprint: 'a' }));

    const guest = await app.request('/api/projects/p1/publication', send('PUT', { project: project('p1'), fingerprint: 'x' }));
    expect(guest.status).toBe(401);
    expect(await errorOf(guest)).toBe(SIGN_IN_NEEDED);
    for (const res of [
      await bo('/api/projects/p1/publication'),
      await bo('/api/projects/p1/publication', send('PUT', { project: project('p1'), fingerprint: 'x' })),
      await bo('/api/projects/p1/publication', { method: 'DELETE' }),
    ]) {
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toBe(NOT_YOURS);
    }

    const broken = await ada('/api/projects/p1/publication', send('PUT', { project: { name: 'x' }, fingerprint: 'a' }));
    expect(broken.status).toBe(400);
    expect(await errorOf(broken)).toMatch(/^The project can’t be published\. /);
    const otherId = await ada('/api/projects/p1/publication', send('PUT', { project: project('p2'), fingerprint: 'a' }));
    expect(await errorOf(otherId)).toBe('The project’s id doesn’t match the address it was sent to.');
  });

  it('are taken down when their project is deleted', async () => {
    const app = createApp();
    const ada = await signedIn(app);
    await ada('/api/projects/p1', send('PUT', { project: project('p1') }));
    const { slug } = (await (await ada('/api/projects/p1/publication', send('PUT', { project: project('p1'), fingerprint: 'a' }))).json()) as Info;
    await ada('/api/projects/p1', { method: 'DELETE' });
    expect((await app.request(`/api/published/${slug}`)).status).toBe(404);
  });
});
