import { randomUUID } from 'node:crypto';
import { expect, test, TEST_PASSWORD } from './support/fixtures';
import { build } from './support/projects';

const newEmail = () => `e2e-${randomUUID()}@example.test`;

test('guests build without an account, and sign up, out and in from the toolbar', async ({ app, page, consoleErrors }) => {
  const account = page.getByRole('dialog', { name: 'Account' });
  const accountButton = page.getByRole('button', { name: /👤/ }).first();
  const email = newEmail();

  // The Server menu asks guests to sign in, and leads to the account menu.
  await app.openServer();
  await expect(app.serverMenu.getByRole('status')).toHaveText(/^Sign in to use the server/);
  await app.serverMenu.getByRole('button', { name: '👤 Sign in' }).click();
  await expect(account).toBeVisible();
  await expect(app.serverMenu).toBeHidden();

  await account.getByRole('button', { name: 'New here? Create an account' }).click();
  await account.getByLabel('Email').fill(email);
  await account.getByLabel('Password').fill('short');
  await account.getByRole('button', { name: 'Create account' }).click();
  await expect(account.getByRole('alert')).toHaveText('⚠ Use a password of at least 8 characters.');
  await account.getByLabel('Password').fill(TEST_PASSWORD);
  await account.getByLabel('Password').press('Enter');
  await expect(app.globalToasts.last()).toHaveText(`Welcome! You’re signed in as ${email}.`);
  await expect(account).toBeHidden();
  await expect(accountButton).toContainText(email);

  // Signed in, the Server menu works, and it still does after a reload.
  await app.openServer();
  await expect(app.serverMenu.getByRole('status')).toHaveText(/^Not deployed/);
  await page.keyboard.press('Escape');
  await app.reload();
  await expect(accountButton).toContainText(email);

  await accountButton.click();
  await account.getByRole('button', { name: 'Sign out' }).click();
  await expect(app.globalToasts.last()).toHaveText('Signed out.');
  await expect(accountButton).toHaveText('👤 Sign in');

  await accountButton.click();
  await account.getByLabel('Email').fill(email);
  await account.getByLabel('Password').fill('wrong password');
  await account.getByRole('button', { name: 'Sign in' }).click();
  await expect(account.getByRole('alert')).toHaveText('⚠ That email and password don’t match an account.');
  await account.getByLabel('Password').fill(TEST_PASSWORD);
  await account.getByRole('button', { name: 'Sign in' }).click();
  await expect(app.globalToasts.last()).toHaveText(`Signed in as ${email}.`);
  // The browser logs the refused tries (the short password and the wrong one).
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/status of 40[01]/.test(e)));
});

test('guests are asked to sign in for table rows and requests sent from the server', async ({
  appNoBoot: app,
  seed,
  consoleErrors,
}) => {
  const b = build('Contacts');
  b.table('Contacts', { Name: 'text' });
  const button = b.element('button', 'Load', { label: 'Load' });
  const click = b.node('event.click', { element: button.id });
  const fetch = b.node('action.fetch', { url: 'http://127.0.0.1:8787/api/health', via: 'server' });
  b.exec(click, 'next', fetch);
  await seed(b.project);
  await app.goto();

  await app.tab('Data');
  await expect(app.page.getByRole('status').filter({ hasText: 'Rows are kept on the Code Blocks server' })).toContainText(
    'Sign in to add and see them.',
  );

  await app.tab('Design');
  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Load' }).click();
  await expect(app.toasts().first()).toHaveText(/^Sign in to use the Code Blocks server/);
  // The browser logs the refused request.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/status of 401/.test(e)));
});

test('a project used by one account is kept from others', async ({ app, page, consoleErrors }) => {
  const account = page.getByRole('dialog', { name: 'Account' });
  const accountButton = page.getByRole('button', { name: /👤/ }).first();
  await app.projectName.fill('Whose app');
  await app.waitForSave();

  for (const [i, email] of [newEmail(), newEmail()].entries()) {
    await accountButton.click();
    if (i > 0) {
      await account.getByRole('button', { name: 'Sign out' }).click();
      await expect(accountButton).toHaveText('👤 Sign in');
      await accountButton.click();
    }
    await account.getByRole('button', { name: 'New here? Create an account' }).click();
    await account.getByLabel('Email').fill(email);
    await account.getByLabel('Password').fill(TEST_PASSWORD);
    await account.getByRole('button', { name: 'Create account' }).click();
    await expect(accountButton).toContainText(email);
    await app.openServer();
    if (i === 0) {
      // Using the server makes the project this account's.
      await expect(app.serverMenu.getByRole('status')).toHaveText(/^Not deployed/);
    } else {
      await expect(app.serverMenu.getByRole('status')).toHaveText('⚠ This project belongs to another account.');
      await expect(app.serverMenu.getByRole('button', { name: /Deploy/ })).toHaveCount(0);
      // It isn't saved to this account either; it stays in this browser.
      await expect(app.saveStatus).toHaveText('⚠ Kept in this browser');
      await expect(app.saveStatus).toHaveAttribute('title', 'This project belongs to another account.');
    }
    await page.keyboard.press('Escape');
  }
  // The browser logs the refused request.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/status of 403/.test(e)));
});
