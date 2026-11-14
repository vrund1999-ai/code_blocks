import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createSite } from './site';

describe('the hosted site', () => {
  let dir: string;
  let site: ReturnType<typeof createSite>;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cb-site-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Code Blocks</title>');
    writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
    writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
    site = createSite(createApp(), dir);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('opens the editor at / and published apps at /app/:slug, from index.html', async () => {
    for (const path of ['/', '/app/k3x9q2abcdef', '/app/k3x9q2abcdef/']) {
      const res = await site.request(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/^text\/html/);
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toContain('<title>Code Blocks</title>');
    }
  });

  it('serves built files, caching the ones in /assets for good', async () => {
    const script = await site.request('/assets/index-abc123.js');
    expect(script.status).toBe(200);
    expect(await script.text()).toBe('console.log(1)');
    expect(script.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const icon = await site.request('/favicon.svg');
    expect(icon.status).toBe(200);
    expect(icon.headers.get('cache-control')).toBeNull();
  });

  it('keeps the API at /api, and answers unknown addresses with 404', async () => {
    expect(await (await site.request('/api/health')).json()).toEqual({ ok: true });
    const unknownApi = await site.request('/api/nothing-here');
    expect(unknownApi.status).toBe(404);
    expect(await unknownApi.json()).toEqual({ error: { message: 'Not found.' } });
    for (const path of ['/missing.js', '/assets/missing.js', '/settings', '/../package.json']) {
      expect((await site.request(path)).status, path).toBe(404);
    }
  });

  it('needs the editor to be built first', () => {
    expect(() => createSite(createApp(), join(dir, 'nothing'))).toThrow(/Run “npm run build” first/);
  });
});
