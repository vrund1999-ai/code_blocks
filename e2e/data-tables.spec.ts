import { readFile } from 'node:fs/promises';
import { expect, test } from './support/fixtures';

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
    await expect(area.locator('.schema-example td')).toHaveText(['1', 'Some text', '42', 'Some text']);

    await area.getByRole('button', { name: 'Move “VIP” left' }).click();
    await expect(area.getByLabel('Column 2 name')).toHaveValue('VIP');
    await expect(area.getByRole('button', { name: 'Move “Name” left' })).toBeDisabled();
    await area.getByRole('button', { name: 'Remove column “VIP”' }).click();
    await expect(area.getByRole('columnheader')).toHaveCount(3);
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
});
