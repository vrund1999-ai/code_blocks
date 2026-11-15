import { expect, test } from './support/fixtures';
import { guestList } from './support/projects';

test.describe('signed in', () => {
  test.use({ signedIn: true });

  test('an app is published to a link that anyone can open, read only', async ({ appNoBoot: app, seed, page, browser }) => {
    const b = guestList();
    await seed(b.project);
    await app.goto();
    // A guest added by the owner.
    const guests = b.project.tables[0];
    const added = await page.request.post(`/api/projects/${b.project.id}/tables/${guests.id}/rows`, {
      data: { values: { [guests.columns[0].id]: 'Ada' } },
    });
    expect(added.ok()).toBe(true);

    // The toolbar button (the menu has buttons starting with 🔗 Publish too).
    const button = page.locator('button[aria-expanded]', { hasText: '🔗 Publish' });
    const menu = page.getByRole('dialog', { name: 'Publish' });
    await button.click();
    await expect(menu.getByRole('status')).toHaveText(/^Not published/);
    await menu.getByRole('button', { name: '🔗 Publish' }).click();
    await expect(app.globalToasts.last()).toHaveText('Published! Anyone with the link can use your app.');
    await expect(menu.getByRole('status')).toHaveText(/Visitors see the latest version\.$/);
    const url = (await menu.locator('.publish-link code').textContent())!;
    expect(url).toMatch(/\/app\/[\w-]{12}$/);
    await expect(menu.getByRole('link', { name: 'Open the app' })).toHaveAttribute('href', url);

    // A visitor, not signed in, sees the app and its rows, and can't add any.
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(url);
    await expect(visitor).toHaveTitle('Guest list');
    const view = visitor.locator('.published-app');
    await expect(view.locator('.list-row .el-text')).toHaveText(['Ada']);
    await expect(view.getByText('1', { exact: true })).toBeVisible();
    await view.getByRole('textbox').fill('Bo');
    await view.getByRole('button', { name: 'Add guest' }).click();
    await expect(view.locator('.toast')).toHaveText(['Visitors can’t add rows to this table. Its owner can allow it in the Data tab.']);

    // Changes reach visitors once published again, at the same link.
    await app.projectName.fill('Party guests');
    await expect(button).toContainText('● Changes not published');
    await expect(menu.getByRole('status')).toHaveText(/publish again so visitors see the changes\.$/);
    await menu.getByRole('button', { name: '🔗 Publish changes' }).click();
    await expect(button).toContainText('● Live');
    expect(await menu.locator('.publish-link code').textContent()).toBe(url);
    await visitor.reload();
    await expect(visitor).toHaveTitle('Party guests');

    // Unpublished, the link says so.
    await menu.getByRole('button', { name: 'Unpublish' }).click();
    await expect(menu.getByRole('status')).toHaveText(/^Not published/);
    await visitor.reload();
    await expect(visitor.getByRole('alert')).toHaveText('⚠ This app isn’t published. Check the link, or ask whoever shared it.');
    await visitorContext.close();
  });

  test('the owner lets visitors add rows to a table, or only add them', async ({ appNoBoot: app, seed, page, browser }) => {
    const b = guestList();
    await seed(b.project);
    await app.goto();
    const guests = b.project.tables[0];
    await page.request.post(`/api/projects/${b.project.id}/tables/${guests.id}/rows`, {
      data: { values: { [guests.columns[0].id]: 'Ada' } },
    });
    const button = page.locator('button[aria-expanded]', { hasText: '🔗 Publish' });
    const menu = page.getByRole('dialog', { name: 'Publish' });
    await button.click();
    await menu.getByRole('button', { name: '🔗 Publish' }).click();
    const url = (await menu.locator('.publish-link code').textContent())!;
    await button.click();

    // A guestbook: visitors see everyone's rows and add their own.
    await app.tab('Data');
    const access = app.dataArea.getByLabel('Visitors of the published app can');
    await expect(access).toHaveValue('read');
    await access.selectOption({ label: 'See the rows and add new ones' });
    await expect(app.dataArea.getByText(/everyone sees what others added/)).toBeVisible();
    await expect(button).toContainText('● Changes not published');
    await button.click();
    await menu.getByRole('button', { name: '🔗 Publish changes' }).click();
    await expect(button).toContainText('● Live');

    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(url);
    const view = visitor.locator('.published-app');
    await expect(view.locator('.list-row .el-text')).toHaveText(['Ada']);
    await view.getByRole('textbox').fill('Bo');
    await view.getByRole('button', { name: 'Add guest' }).click();
    await expect(view.locator('.list-row .el-text')).toHaveText(['Ada', 'Bo']);
    await expect(view.getByText('2', { exact: true })).toBeVisible();

    // The owner sees the visitor's row in the Data tab.
    await app.waitForSave();
    await app.reload();
    await app.tab('Data');
    await expect(app.dataArea.getByLabel('Row 2 Name')).toHaveValue('Bo');

    // A sign-up list: visitors add rows without seeing anyone's.
    await app.dataArea.getByLabel('Visitors of the published app can').selectOption({ label: 'Add new rows, without seeing any' });
    await button.click();
    await menu.getByRole('button', { name: '🔗 Publish changes' }).click();
    await expect(button).toContainText('● Live');
    await visitor.reload();
    await expect(view.locator('.toast').first()).toHaveText('Visitors can add rows to this table, but not see them.');
    await expect(view.locator('.list-row')).toHaveCount(0);
    await view.getByRole('textbox').fill('Cy');
    await view.getByRole('button', { name: 'Add guest' }).click();
    await expect.poll(async () => {
      const res = await page.request.get(`/api/projects/${b.project.id}/tables/${guests.id}/rows`);
      return ((await res.json()) as { rows: { values: Record<string, unknown> }[] }).rows.map((r) => r.values[guests.columns[0].id]);
    }).toEqual(['Ada', 'Bo', 'Cy']);
    await visitorContext.close();
  });
});

test('guests are asked to sign in to publish', async ({ app, page }) => {
  await page.getByRole('button', { name: /^🔗 Publish/ }).click();
  const menu = page.getByRole('dialog', { name: 'Publish' });
  await expect(menu.getByRole('status')).toHaveText('Sign in to publish your app to a link you can share.');
  await menu.getByRole('button', { name: '👤 Sign in' }).click();
  await expect(page.getByRole('dialog', { name: 'Account' })).toBeVisible();
  await expect(app.projectName).toBeVisible();
});
