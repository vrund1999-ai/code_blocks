import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { NOT_YOURS, SIGN_IN_NEEDED } from './authRoutes';
import { CHANGED_ELSEWHERE, NOT_SAVED } from './projectRoutes';
import { signedIn } from './testAuth';

const project = (id: string, name = 'My app') => ({
  version: 2,
  id,
  name,
  screens: [{ id: 's1', name: 'Home', root: { id: 'r1', type: 'container', name: 'Screen', props: {}, children: [] } }],
  variables: [],
  tables: [],
  graph: { nodes: [], edges: [] },
});

const put = (body: unknown) => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const errorOf = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message;

describe('saved projects', () => {
  it('are saved, listed, opened and deleted', async () => {
    const app = createApp();
    const ada = await signedIn(app);

    const first = await ada('/api/projects/p1', put({ project: project('p1', 'Shop'), baseVersion: null }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ version: 1, updatedAt: expect.any(Number) });
    await ada('/api/projects/p2', put({ project: project('p2', 'Quiz') }));
    const again = await ada('/api/projects/p1', put({ project: project('p1', 'Shop 2'), baseVersion: 1 }));
    expect(((await again.json()) as { version: number }).version).toBe(2);

    const list = (await (await ada('/api/projects')).json()) as { projects: { id: string; name: string; version: number }[] };
    expect(list.projects.map((p) => [p.id, p.name, p.version]).sort()).toEqual([
      ['p1', 'Shop 2', 2],
      ['p2', 'Quiz', 1],
    ]);

    const opened = (await (await ada('/api/projects/p1')).json()) as { project: { name: string }; version: number };
    expect(opened.project.name).toBe('Shop 2');
    expect(opened.version).toBe(2);

    expect((await ada('/api/projects/p1', { method: 'DELETE' })).status).toBe(200);
    const gone = await ada('/api/projects/p1');
    expect(gone.status).toBe(404);
    expect(await errorOf(gone)).toBe(NOT_SAVED);
  });

  it('refuse a save based on an older version, unless asked to replace it', async () => {
    const app = createApp();
    const ada = await signedIn(app);
    await ada('/api/projects/p1', put({ project: project('p1'), baseVersion: null }));
    await ada('/api/projects/p1', put({ project: project('p1', 'From tab A'), baseVersion: 1 }));

    const stale = await ada('/api/projects/p1', put({ project: project('p1', 'From tab B'), baseVersion: 1 }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      error: { message: CHANGED_ELSEWHERE },
      current: { id: 'p1', name: 'From tab A', version: 2, updatedAt: expect.any(Number) },
    });
    // A new project with the id of a saved one is refused too.
    expect((await ada('/api/projects/p1', put({ project: project('p1'), baseVersion: null }))).status).toBe(409);

    const replaced = await ada('/api/projects/p1', put({ project: project('p1', 'From tab B'), baseVersion: 'any' }));
    expect(((await replaced.json()) as { version: number }).version).toBe(3);
  });

  it('are checked before they are saved', async () => {
    const ada = await signedIn(createApp());
    const notOne = await ada('/api/projects/p1', put({ project: { name: 'x' } }));
    expect(notOne.status).toBe(400);
    expect(await errorOf(notOne)).toMatch(/^The project can’t be saved\. /);
    const otherId = await ada('/api/projects/p1', put({ project: project('p2') }));
    expect(await errorOf(otherId)).toBe('The project’s id doesn’t match the address it was sent to.');
    const badBase = await ada('/api/projects/p1', put({ project: project('p1'), baseVersion: 'latest' }));
    expect(badBase.status).toBe(400);
  });

  it('are kept from guests and other accounts', async () => {
    const app = createApp();
    const ada = await signedIn(app);
    const bo = await signedIn(app);
    await ada('/api/projects/p1', put({ project: project('p1') }));

    for (const path of ['/api/projects', '/api/projects/p1']) {
      const res = await app.request(path);
      expect(res.status, path).toBe(401);
      expect(await errorOf(res)).toBe(SIGN_IN_NEEDED);
    }
    for (const res of [
      await bo('/api/projects/p1'),
      await bo('/api/projects/p1', put({ project: project('p1', 'Taken'), baseVersion: 'any' })),
      await bo('/api/projects/p1', { method: 'DELETE' }),
    ]) {
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toBe(NOT_YOURS);
    }
    expect(await (await bo('/api/projects')).json()).toEqual({ projects: [] });
    expect(((await (await ada('/api/projects/p1')).json()) as { project: { name: string } }).project.name).toBe('My app');
  });

  it('stop the server workflows of a deleted project', async () => {
    const app = createApp();
    const ada = await signedIn(app);
    await ada('/api/projects/p1', put({ project: project('p1') }));
    await ada('/api/projects/p1/deployment', put({ name: 'My app', graph: { nodes: [], edges: [] } }));
    expect(((await (await ada('/api/projects/p1/deployment')).json()) as { deployed: boolean }).deployed).toBe(true);
    await ada('/api/projects/p1', { method: 'DELETE' });
    expect(((await (await ada('/api/projects/p1/deployment')).json()) as { deployed: boolean }).deployed).toBe(false);
  });
});
