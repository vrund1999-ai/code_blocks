import { randomUUID } from 'node:crypto';
import { expect, test, TEST_PASSWORD } from './support/fixtures';
import { linkIn, lastEmail } from './support/mail';

const newEmail = () => `e2e-${randomUUID()}@example.test`;
/** The browser logs refused requests (wrong passwords, a used link); the tests expect those. */
const allowRefused = (errors: string[]) =>
  errors.splice(0, errors.length, ...errors.filter((e) => !/status of 40[03]/.test(e)));

test('a forgotten password is reset with a link sent by email', async ({ app, page, consoleErrors }) => {
  const email = newEmail();
  // An account, signed out again.
  expect((await page.request.post('/api/auth/signup', { data: { email, password: TEST_PASSWORD } })).ok()).toBe(true);
  expect((await page.request.post('/api/auth/signout', { data: {} })).ok()).toBe(true);
  await app.reload();

  const account = page.getByRole('dialog', { name: 'Account' });
  const accountButton = page.getByRole('button', { name: /👤/ }).first();
  await accountButton.click();
  await account.getByRole('button', { name: 'Forgot your password?' }).click();
  await account.getByLabel('Email').fill(email);
  await account.getByRole('button', { name: 'Email me a link' }).click();
  await expect(account.getByRole('status')).toContainText('If there’s an account with that email, we’ve sent it a link');
  // The test server has no SMTP server, so it says so.
  await expect(account.getByRole('status')).toContainText('the link is in the server’s log');

  const mail = await lastEmail(email);
  expect(mail.subject).toBe('Choose a new password for Code Blocks');
  const link = linkIn(mail);
  expect(link).toMatch(/^http:\/\/localhost:\d+\/#reset=[\w-]{43}$/);

  // The link opens the editor, asking for a new password, and leaves no token in the address.
  await page.goto(link);
  await expect(account.getByText('Choose a new password', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await account.getByLabel('New password').fill('battery staple');
  await account.getByRole('button', { name: 'Save new password' }).click();
  await expect(app.globalToasts.last()).toHaveText(`Your new password is saved. You’re signed in as ${email}.`);
  await expect(accountButton).toContainText(email);
  expect((await page.request.post('/api/auth/signin', { data: { email, password: TEST_PASSWORD } })).status()).toBe(401);

  // The link works once. (Opened in a new tab this time, as from an email.)
  const tab = await page.context().newPage();
  await tab.goto(link);
  const tabAccount = tab.getByRole('dialog', { name: 'Account' });
  await tabAccount.getByLabel('New password').fill('another password');
  await tabAccount.getByRole('button', { name: 'Save new password' }).click();
  await expect(tabAccount.getByRole('alert')).toHaveText(
    '⚠ This link to choose a new password has expired or was already used. Ask for a new one.',
  );
  await expect(tab).toHaveURL(/\/$/);
  await tabAccount.getByRole('button', { name: 'Cancel' }).click();
  await expect(tabAccount.getByText(`Signed in as ${email}`)).toBeVisible();
  await tab.close();
  allowRefused(consoleErrors);
});

test.describe('signed in', () => {
  test.use({ signedIn: true });

  test('the account menu changes the password and email, checking the current password', async ({ app, page, account, consoleErrors }) => {
    const menu = page.getByRole('dialog', { name: 'Account' });
    const accountButton = page.getByRole('button', { name: /👤/ }).first();
    await accountButton.click();

    await menu.getByRole('button', { name: 'Change password' }).click();
    await menu.getByLabel('Current password').fill('wrong password');
    await menu.getByLabel('New password').fill('battery staple');
    await menu.getByRole('button', { name: 'Change password' }).click();
    await expect(menu.getByRole('alert')).toHaveText('⚠ That isn’t your current password.');
    await menu.getByLabel('Current password').fill(TEST_PASSWORD);
    await menu.getByRole('button', { name: 'Change password' }).click();
    await expect(app.globalToasts.last()).toHaveText('Your password was changed. Other browsers were signed out.');
    // Still signed in here, back at the account's buttons.
    await expect(menu.getByText(`Signed in as ${account!.email}`)).toBeVisible();

    const newEmail = `new-${account!.email}`;
    await menu.getByRole('button', { name: 'Change email' }).click();
    await expect(menu.getByText(`We’ll let ${account!.email} know it was changed.`)).toBeVisible();
    await menu.getByLabel('Current password').fill('battery staple');
    await menu.getByLabel('New email').fill(newEmail);
    await menu.getByRole('button', { name: 'Change email' }).click();
    await expect(app.globalToasts.last()).toHaveText(`Your email is now ${newEmail}.`);
    await expect(accountButton).toContainText(newEmail);
    expect((await lastEmail(account!.email)).subject).toBe('Your Code Blocks email was changed');

    // Signed in with the new email and password after a reload.
    await app.reload();
    await expect(accountButton).toContainText(newEmail);
    allowRefused(consoleErrors);
  });

  test('deleting the account deletes its projects on the server, and keeps the open one here', async ({
    app,
    page,
    account,
    consoleErrors,
  }) => {
    // Changed, so it's saved to the account (an untouched starter project isn't).
    await app.projectName.fill('Shop');
    await app.waitForSave();
    const menu = page.getByRole('dialog', { name: 'Account' });
    const accountButton = page.getByRole('button', { name: /👤/ }).first();
    expect(((await (await page.request.get('/api/projects')).json()) as { projects: unknown[] }).projects).toHaveLength(1);

    await accountButton.click();
    await menu.getByRole('button', { name: 'Delete account…' }).click();
    await expect(menu.getByText(/It can’t be undone\./)).toBeVisible();
    await menu.getByLabel('Current password').fill('wrong password');
    await menu.getByRole('button', { name: 'Delete my account' }).click();
    await expect(menu.getByRole('alert')).toHaveText('⚠ That isn’t your current password.');
    // Cancelling goes back without deleting anything.
    await menu.getByRole('button', { name: 'Cancel' }).click();
    await menu.getByRole('button', { name: 'Delete account…' }).click();
    await menu.getByLabel('Current password').fill(TEST_PASSWORD);
    await menu.getByRole('button', { name: 'Delete my account' }).click();
    await expect(app.globalToasts.last()).toHaveText('Your account was deleted.');
    await expect(accountButton).toHaveText('👤 Sign in');
    await expect(app.projectName).toBeVisible();

    // The account is gone; a new one with the same email starts with no projects.
    expect((await page.request.post('/api/auth/signin', { data: { email: account!.email, password: TEST_PASSWORD } })).status()).toBe(401);
    expect((await page.request.post('/api/auth/signup', { data: { email: account!.email, password: TEST_PASSWORD } })).ok()).toBe(true);
    expect(await (await page.request.get('/api/projects')).json()).toEqual({ projects: [] });
    allowRefused(consoleErrors);
  });
});
