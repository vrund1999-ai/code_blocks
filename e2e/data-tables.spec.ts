import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { allowFailedRequestErrors } from './support/api';
import { expect, test } from './support/fixtures';

// These use the server, which needs an account.
test.use({ signedIn: true });

/** Waits until autosave has stored this many tables. */
const tablesSaved = (page: Page, n: number) =>
  expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem(`cb.project.${localStorage.getItem('cb.lastProject')}`);
        return raw ? (JSON.parse(raw) as { tables: unknown[] }).tables.length : 0;
      }),
    )
    .toBe(n);

/** Runs `action` and waits for the server to answer the row change it makes. */
async function saved(page: Page, method: string, action: () => Promise<unknown>) {
  const answer = page.waitForResponse((r) => r.url().includes('/rows') && r.request().method() === method);
  await action();
  expect((await answer).ok()).toBe(true);
}

test.describe('Data tab', () => {
  test('design a table: name it, add, change, move and remove columns', async ({ app }) => {
    await app.tab('Data');
    const area = app.dataArea;
    await expect(area.getByRole('heading', { name: /Keep your app’s data in tables/ })).toBeVisible();
    await area.getByRole('button', { name: '+ Add table' }).click();

    // A new table starts with one text column, "Name", after the automatic id.
    const name = area.getByLabel('Table name');
    await expect(name).toHaveValue('My table');
    await name.fill('Contacts');
    await expect(app.tablesPanel.getByRole('button', { name: /Contacts/ })).toContainText('1 column');
    await expect(area.getByLabel('Column 1 name')).toHaveValue('Name');
    await expect(area.getByRole('columnheader').first()).toContainText('id');

    const add = area.getByRole('group', { name: 'Add a column' });
    await add.getByRole('button', { name: '+ Number column' }).click();
    await add.getByRole('button', { name: '+ Yes / No column' }).click();
    await area.getByLabel('Column 2 name').fill('Age');
    await area.getByLabel('Column 3 name').fill('VIP');
    await area.getByLabel('Column 3 kind').selectOption({ label: 'Text' });
    // The example row shows what each column holds.
    await expect(area.locator('.schema-example td')).toHaveText(['1', 'Some text', '42', 'Some text', '']);

    await area.getByRole('button', { name: 'Move “VIP” left' }).click();
    await expect(area.getByLabel('Column 2 name')).toHaveValue('VIP');
    await expect(area.getByRole('button', { name: 'Move “Name” left' })).toBeDisabled();
    await area.getByRole('button', { name: 'Remove column “VIP”' }).click();
    // id, Name, Age, and the row actions.
    await expect(area.getByRole('columnheader')).toHaveCount(4);
    await expect(app.tablesPanel.getByRole('button', { name: /Contacts/ })).toContainText('2 columns');

    // Undo brings the column back.
    await app.undoButton.click();
    await expect(area.getByLabel('Column 2 name')).toHaveValue('VIP');
  });

  test('explains names that can’t be used', async ({ app }) => {
    await app.tab('Data');
    await app.tablesPanel.getByRole('button', { name: '+ Add table' }).click();
    const area = app.dataArea;
    await area.getByRole('group', { name: 'Add a column' }).getByRole('button', { name: '+ Text column' }).click();

    await area.getByLabel('Column 2 name').fill(' name');
    await expect(area.getByRole('alert')).toHaveText(['Another column is already called “Name”.', 'Another column is already called “name”.']);
    await expect(area.getByLabel('Column 2 name')).toHaveAttribute('aria-invalid', 'true');
    await area.getByLabel('Column 2 name').fill('ID');
    await expect(area.getByRole('alert')).toHaveText(/row number every row gets/);
    await area.getByLabel('Column 2 name').fill('');
    await expect(area.getByRole('alert')).toHaveText('Give this column a name.');
    await area.getByLabel('Column 2 name').fill('Email');
    await expect(area.getByRole('alert')).toHaveCount(0);

    // Two tables can't share a name either.
    await app.tablesPanel.getByRole('button', { name: '+ Add table' }).click();
    await area.getByLabel('Table name').fill('my table');
    await expect(area.getByRole('alert')).toHaveText('Another table is already called “my table”.');
    // Switching tables and deleting one.
    await app.tablesPanel.getByRole('button', { name: /^▦ My table\b/ }).click();
    await expect(area.getByLabel('Column 2 name')).toHaveValue('Email');
    await area.getByRole('button', { name: 'Delete table' }).click();
    await expect(app.tablesPanel.getByRole('button', { name: /▦/ })).toHaveCount(1);
    await expect(area.getByLabel('Table name')).toHaveValue('my table');
  });

  test('tables are saved with the project and exported', async ({ app, page }) => {
    await app.tab('Data');
    await app.tablesPanel.getByRole('button', { name: '+ Add table' }).click();
    await app.dataArea.getByLabel('Table name').fill('Orders');
    await app.dataArea.getByRole('button', { name: '+ Number column' }).click();
    await app.waitForSave();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = localStorage.getItem(`cb.project.${localStorage.getItem('cb.lastProject')}`);
          return raw ? (JSON.parse(raw) as { tables: { name: string }[] }).tables.map((t) => t.name) : null;
        }),
      )
      .toEqual(['Orders']);

    await app.reload();
    await app.tab('Data');
    await expect(app.dataArea.getByLabel('Table name')).toHaveValue('Orders');
    await expect(app.dataArea.getByLabel('Column 2 name')).toHaveValue('Number');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export/ }).click();
    const data = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    expect(data.tables).toMatchObject([
      {
        name: 'Orders',
        columns: [
          { name: 'Name', type: 'text' },
          { name: 'Number', type: 'number' },
        ],
      },
    ]);
  });

  test('add, edit and delete rows; the server keeps them', async ({ app, page }) => {
    await app.tab('Data');
    const area = app.dataArea;
    await area.getByRole('button', { name: '+ Add table' }).click();
    await area.getByLabel('Table name').fill('Contacts');
    const add = area.getByRole('group', { name: 'Add a column' });
    await add.getByRole('button', { name: '+ Number column' }).click();
    await add.getByRole('button', { name: '+ Yes / No column' }).click();
    await area.getByLabel('Column 2 name').fill('Age');
    await area.getByLabel('Column 3 name').fill('VIP');
    await expect(area.getByText(/No rows yet/)).toBeVisible();

    await saved(page, 'POST', () => area.getByRole('button', { name: '+ Add row' }).click());
    await saved(page, 'POST', () => area.getByRole('button', { name: '+ Add row' }).click());
    await expect(area.getByText('2 rows.')).toBeVisible();
    await expect(area.locator('.row-id')).toHaveText(['1', '2']);

    // Text and numbers save on Enter or when leaving the cell; yes/no saves on click.
    await area.getByLabel('Row 1 Name').fill('Ada');
    await saved(page, 'PATCH', () => area.getByLabel('Row 1 Name').press('Enter'));
    await area.getByLabel('Row 1 Age').fill('36');
    await saved(page, 'PATCH', () => area.getByLabel('Row 1 VIP').check());
    await area.getByLabel('Row 2 Name').fill('Bo');
    await saved(page, 'PATCH', () => area.getByLabel('Row 2 Name').blur());
    // Escape gives up an edit.
    await area.getByLabel('Row 2 Name').fill('Nope');
    await area.getByLabel('Row 2 Name').press('Escape');
    await expect(area.getByLabel('Row 2 Name')).toHaveValue('Bo');

    // Deleting asks first.
    await area.getByRole('button', { name: 'Delete row 2' }).click();
    await area.getByRole('button', { name: 'Keep' }).click();
    await expect(area.locator('.row-id')).toHaveText(['1', '2']);
    await area.getByRole('button', { name: 'Delete row 2' }).click();
    await saved(page, 'DELETE', () => area.getByRole('button', { name: 'Delete row 2' }).click());
    await expect(area.locator('.row-id')).toHaveText(['1']);
    await expect(area.getByText('1 row.')).toBeVisible();

    // The rows come back from the server after a reload.
    await tablesSaved(page, 1);
    await app.reload();
    await app.tab('Data');
    await expect(area.getByLabel('Row 1 Name')).toHaveValue('Ada');
    await expect(area.getByLabel('Row 1 Age')).toHaveValue('36');
    await expect(area.getByLabel('Row 1 VIP')).toBeChecked();

    // Changing a column's kind shows its values in the new kind.
    await area.getByLabel('Column 2 kind').selectOption({ label: 'Text' });
    await expect(area.getByLabel('Row 1 Age')).toHaveAttribute('type', 'text');
    await expect(area.getByLabel('Row 1 Age')).toHaveValue('36');
    // A new row is numbered after the deleted one.
    await saved(page, 'POST', () => area.getByRole('button', { name: '+ Add row' }).click());
    await expect(area.locator('.row-id')).toHaveText(['1', '3']);
  });

  test('explains when the server can’t be reached, and tries again', async ({ app, page, consoleErrors }) => {
    await page.route('**/api/projects/**', (route) => route.abort('connectionrefused'));
    await app.tab('Data');
    await app.dataArea.getByRole('button', { name: '+ Add table' }).click();
    const alert = app.dataArea.getByRole('alert');
    await expect(alert).toContainText('Can’t reach the Code Blocks server');
    await expect(alert).toContainText('npm run dev:server');
    await expect(app.dataArea.getByRole('button', { name: '+ Add row' })).toHaveCount(0);
    // The columns can still be designed.
    await expect(app.dataArea.getByLabel('Column 1 name')).toBeEnabled();

    await page.unroute('**/api/projects/**');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(app.dataArea.getByText(/No rows yet/)).toBeVisible();
    allowFailedRequestErrors(consoleErrors);
  });

  test('a change the server refuses is undone, with its message', async ({ app, page, consoleErrors }) => {
    await app.tab('Data');
    const area = app.dataArea;
    await area.getByRole('button', { name: '+ Add table' }).click();
    await area.getByRole('group', { name: 'Add a column' }).getByRole('button', { name: '+ Yes / No column' }).click();
    await saved(page, 'POST', () => area.getByRole('button', { name: '+ Add row' }).click());

    await page.route('**/rows/1', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Not today.' } }) }),
    );
    await area.getByLabel('Row 1 Yes or no').click();
    await expect(app.page.locator('.global-toasts .toast')).toHaveText('Not today.');
    await expect(area.getByLabel('Row 1 Yes or no')).not.toBeChecked();
    await area.getByLabel('Row 1 Name').fill('Ada');
    await area.getByLabel('Row 1 Name').press('Enter');
    await expect(area.getByLabel('Row 1 Name')).toHaveValue('');
    allowFailedRequestErrors(consoleErrors);
  });
});
