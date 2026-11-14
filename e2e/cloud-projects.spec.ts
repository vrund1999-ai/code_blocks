import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test, TEST_PASSWORD } from './support/fixtures';
import { AppPage } from './support/AppPage';

/** Whether the open project has a copy in this browser's localStorage. */
const copyHere = (page: Page) =>
  page.evaluate(() => {
    const id = localStorage.getItem('cb.lastProject');
    return id !== null && localStorage.getItem(`cb.project.${id}`) !== null;
  });

/** Opens the editor in another tab of the same browser. */
async function otherTab(page: Page) {
  const tab = new AppPage(await page.context().newPage());
  await tab.goto();
  return tab;
}

/** The browser logs requests the server refused, such as saves of a changed project. */
const allowRefused = (consoleErrors: string[], status: string) =>
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !new RegExp(`status of ${status}`).test(e)));

test.describe('signed in', () => {
  test.use({ signedIn: true });

  test('projects are saved to the account and open in another browser', async ({ app, page, browser }) => {
    await app.projectName.fill('Kept on my account');
    await app.waitForSave();
    await expect(app.saveStatus).toHaveText('☁ Saved to your account');
    expect(await copyHere(page)).toBe(false);

    // A reload opens it from the account.
    await app.reload();
    await expect(app.projectName).toHaveValue('Kept on my account');
    await expect(app.saveStatus).toHaveText('☁ Saved to your account');

    // Another browser, signed in to the same account, starts with something new and lists it.
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
    await context.addCookies(await page.context().cookies());
    const other = new AppPage(await context.newPage());
    await other.goto();
    await expect(other.projectName).toHaveValue('Hello Name');
    const menu = await other.openProjects();
    await expect(menu.locator('.menu-title')).toContainText(['On your account']);
    await menu.locator('.menu-item.project', { hasText: 'Kept on my account' }).getByRole('button').first().click();
    await expect(other.projectName).toHaveValue('Kept on my account');
    await expect(other.saveStatus).toHaveText('☁ Saved to your account');
    await context.close();
  });

  test('a project changed in another tab asks which copy to keep', async ({ app, page, consoleErrors }) => {
    await app.projectName.fill('First');
    await app.waitForSave();

    const b = await otherTab(page);
    await expect(b.projectName).toHaveValue('First');
    await b.projectName.fill('Changed in tab B');
    await b.waitForSave();

    // The first tab's next change isn't saved over tab B's.
    await app.projectName.fill('Changed in tab A');
    const problem = page.getByRole('button', { name: '⚠ Changed somewhere else' });
    await expect(problem).toBeVisible();
    await problem.click();
    const choose = page.getByRole('dialog', { name: 'Which copy to keep' });
    await expect(choose).toContainText('This project was changed in another tab or browser after you opened it here.');
    await choose.getByRole('button', { name: 'Keep this copy' }).click();
    await expect(app.saveStatus).toHaveText('☁ Saved to your account');
    await b.reload();
    await expect(b.projectName).toHaveValue('Changed in tab A');

    // Or the other copy can be opened instead.
    await b.projectName.fill('Newest, from tab B');
    await b.waitForSave();
    await app.projectName.fill('Lost change');
    await problem.click();
    await choose.getByRole('button', { name: 'Open the newest copy' }).click();
    await expect(app.projectName).toHaveValue('Newest, from tab B');
    await expect(app.saveStatus).toHaveText('☁ Saved to your account');
    await app.projectName.fill('Saved again');
    await app.waitForSave();
    allowRefused(consoleErrors, '409');
  });

  test('while the server can’t be reached, changes are kept in this browser', async ({ app, page, consoleErrors }) => {
    await app.projectName.fill('Before');
    await app.waitForSave();
    await page.route('**/api/projects/**', (route) => route.abort('connectionrefused'));
    await app.projectName.fill('While offline');
    await expect(app.saveStatus).toHaveText('⚠ Not saved to your account');
    await expect(app.saveStatus).toHaveAttribute('title', /kept in this browser for now/);
    expect(await copyHere(page)).toBe(true);

    // Reopened later, the copy here is sent to the account.
    await page.unroute('**/api/projects/**');
    await app.reload();
    await expect(app.projectName).toHaveValue('While offline');
    await expect(app.saveStatus).toHaveText('☁ Saved to your account');
    expect(await copyHere(page)).toBe(false);
    consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource|NetworkError|Could not connect/i.test(e)));
  });
});

test('signing in moves projects from this browser to the account as they are opened', async ({ app, page }) => {
  await app.projectName.fill('Made as a guest');
  await app.waitForSave();
  await expect(app.saveStatus).toHaveText('Saved in this browser');
  await app.loadTemplate('Counter');

  await page.getByRole('button', { name: '👤 Sign in' }).click();
  const account = page.getByRole('dialog', { name: 'Account' });
  await account.getByRole('button', { name: 'New here? Create an account' }).click();
  await account.getByLabel('Email').fill(`e2e-${randomUUID()}@example.test`);
  await account.getByLabel('Password').fill(TEST_PASSWORD);
  await account.getByRole('button', { name: 'Create account' }).click();

  // The open project goes to the account; the other one waits in this browser.
  await expect(app.saveStatus).toHaveText('☁ Saved to your account');
  let menu = await app.openProjects();
  const onAccount = menu.locator('.menu-title', { hasText: 'On your account' });
  await expect(menu.locator('.menu-title')).toHaveText(['Start something new', 'On your account', 'In this browser only']);
  await expect(menu.locator('.menu-item.project')).toHaveText([/^Counter/, /^Made as a guest/]);
  await expect(onAccount).toBeVisible();

  await menu.locator('.menu-item.project', { hasText: 'Made as a guest' }).getByRole('button').first().click();
  await expect(app.projectName).toHaveValue('Made as a guest');
  await expect(app.saveStatus).toHaveText('☁ Saved to your account');
  menu = await app.openProjects();
  await expect(menu.locator('.menu-title')).toHaveText(['Start something new', 'On your account']);
  await expect(menu.locator('.menu-item.project')).toHaveCount(2);

  // Deleting one removes it from the account.
  await menu.locator('.menu-item.project', { hasText: 'Counter' }).getByTitle('Delete project').click();
  await expect(menu.locator('.menu-item.project')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await app.reload();
  menu = await app.openProjects();
  await expect(menu.locator('.menu-item.project')).toHaveText([/^Made as a guest/]);
});
