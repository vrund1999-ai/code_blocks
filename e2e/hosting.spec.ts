// The server as it's hosted (the third web server in playwright.config.ts):
// it serves the built editor itself, limits sign-ins, and blocks requests to
// its own network.

import { randomInt, randomUUID } from 'node:crypto';
import { allowFailedRequestErrors } from './support/api';
import { expect, test, TEST_PASSWORD } from './support/fixtures';
import { build, guestList } from './support/projects';

const HOSTED = 'http://127.0.0.1:8788';

test.use({
  baseURL: HOSTED,
  // The hosted server trusts its proxy (TRUST_PROXY), so each test comes from its
  // own address and has its own sign-up and sign-in limits.
  extraHTTPHeaders: async ({}, use) => use({ 'x-forwarded-for': `203.0.113.${randomInt(1, 255)}, 10.0.0.${randomInt(1, 255)}` }),
});

test.describe('signed in', () => {
  test.use({ signedIn: true });

  test('one server opens the editor and its published apps', async ({ appNoBoot: app, seed, page, browser }) => {
    const b = guestList();
    await seed(b.project);
    await app.goto();
    const guests = b.project.tables[0];
    await page.request.post(`/api/projects/${b.project.id}/tables/${guests.id}/rows`, {
      data: { values: { [guests.columns[0].id]: 'Ada' } },
    });

    const menu = page.getByRole('dialog', { name: 'Publish' });
    await page.locator('button[aria-expanded]', { hasText: '🔗 Publish' }).click();
    await menu.getByRole('button', { name: '🔗 Publish' }).click();
    await expect(menu.getByRole('status')).toHaveText(/Visitors see the latest version\.$/);
    const url = (await menu.locator('.publish-link code').textContent())!;
    expect(url.startsWith(`${HOSTED}/app/`)).toBe(true);

    // The server answers the published app's address with the app, also on reload.
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    const scripts: string[] = [];
    visitor.on('response', (r) => void (r.request().resourceType() === 'script' && scripts.push(new URL(r.url()).pathname)));
    await visitor.goto(url);
    await expect(visitor.locator('.published-app .list-row .el-text')).toHaveText(['Ada']);
    // Visitors download the app, not the editor (QE-3).
    expect(scripts.some((s) => s.startsWith('/assets/PublishedApp-'))).toBe(true);
    expect(scripts.filter((s) => /^\/assets\/(App|LogicWorkspace)-/.test(s))).toEqual([]);
    await visitor.reload();
    await expect(visitor.locator('.published-app .list-row .el-text')).toHaveText(['Ada']);
    await visitorContext.close();

    // The Logic tab, loaded on its own, opens in the built editor too.
    await app.tab('Logic');
    await expect(app.page.locator('.react-flow__node').first()).toBeVisible();
  });

  test('requests sent from the server can’t reach its own network', async ({ appNoBoot: app, seed, consoleErrors }) => {
    const b = build('Snooping');
    const button = b.element('button', 'Load', { label: 'Load' });
    const click = b.node('event.click', { element: button.id });
    const fetch = b.node('action.fetch', { url: 'http://127.0.0.1:8788/api/health', via: 'server' });
    b.exec(click, 'next', fetch);
    await seed(b.project);
    await app.goto();

    await app.run();
    await app.designCanvas.getByRole('button', { name: 'Load' }).click();
    await expect(app.errorPill).toBeVisible();
    await expect(app.toasts().first()).toContainText('The server can’t send requests to 127.0.0.1: it’s on the server’s own network.');
    allowFailedRequestErrors(consoleErrors);
  });
});

test('too many wrong passwords stop sign-ins for a while', async ({ app: _, page, consoleErrors }) => {
  const email = `e2e-${randomUUID()}@example.test`;
  const made = await page.request.post('/api/auth/signup', { data: { email, password: TEST_PASSWORD } });
  expect(made.ok()).toBe(true);
  await page.request.post('/api/auth/signout');
  for (let i = 0; i < 10; i++) {
    const res = await page.request.post('/api/auth/signin', { data: { email, password: 'wrong password' } });
    expect(res.status()).toBe(401);
  }

  // Even the right password is refused now.
  await page.getByRole('button', { name: /👤/ }).first().click();
  const account = page.getByRole('dialog', { name: 'Account' });
  await account.getByLabel('Email').fill(email);
  await account.getByLabel('Password').fill(TEST_PASSWORD);
  await account.getByRole('button', { name: 'Sign in' }).click();
  await expect(account.getByRole('alert')).toHaveText(
    '⚠ Too many sign-in attempts with that email. Try again in 15 minutes.',
  );
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/status of 429/.test(e)));
});
