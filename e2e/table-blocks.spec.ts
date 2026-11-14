import { expect, test } from './support/fixtures';
import { build, guestList } from './support/projects';

// These use the server, which needs an account.
test.use({ signedIn: true });

test('an app adds rows to a table and loads them again next time', async ({ appNoBoot: app, seed }) => {
  await seed(guestList().project);
  await app.goto();
  const canvas = app.designCanvas;

  await app.run();
  await expect(canvas.getByText('0', { exact: true })).toBeVisible();
  for (const guest of ['Ada', 'Grace']) {
    await canvas.getByRole('textbox').fill(guest);
    await canvas.getByRole('button', { name: 'Add guest' }).click();
  }
  await expect(canvas.locator('.list-row .el-text')).toHaveText(['Ada', 'Grace']);
  await expect(canvas.getByText('2', { exact: true })).toBeVisible();
  await app.stop();

  // The rows were saved by the server, so running again loads them.
  await app.run();
  await expect(canvas.locator('.list-row .el-text')).toHaveText(['Ada', 'Grace']);
  await app.stop();

  // The Data tab shows the same rows, with the yes/no column filled in.
  await app.tab('Data');
  await expect(app.dataArea.getByLabel('Row 1 Name')).toHaveValue('Ada');
  await expect(app.dataArea.getByLabel('Row 2 Name')).toHaveValue('Grace');
  await expect(app.dataArea.getByLabel('Row 2 Coming')).toBeChecked();
});

test('table blocks: the palette, the table picker and what blocks say', async ({ appNoBoot: app, seed }) => {
  const b = build('Tables');
  b.table('Orders', { Item: 'text' });
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');

  const palette = app.page.locator('.node-palette');
  await expect(palette.locator('.node-cat-title', { hasText: 'Tables' })).toContainText('Read and change the rows of your data tables');
  await app.addBlock('Get rows');
  const block = app.block('table.query');
  await expect(block.locator('.block-sentence')).toHaveText('Get rows of a table');
  await expect(block.locator('.pin-row.out .pin-label')).toHaveText(['Rows', 'How many', 'First row']);

  await block.click();
  const picker = app.inspectorField('Table').locator('select');
  await picker.selectOption({ label: '▦ Orders' });
  await expect(block.locator('.block-sentence')).toHaveText('Get rows of “Orders”');

  // Deleting the table makes the block ask for one again; undo brings both back.
  await app.tab('Data');
  await app.dataArea.getByRole('button', { name: 'Delete table' }).click();
  await app.tab('Logic');
  await expect(block.locator('.block-sentence')).toHaveText('Get rows of a table');
  await app.undoButton.click();
  await expect(block.locator('.block-sentence')).toHaveText('Get rows of “Orders”');
});

test('a block using a table that is gone shows an error on it', async ({ appNoBoot: app, seed }) => {
  const b = build('Broken');
  const open = b.node('event.screenLoad', { screen: b.screen.id });
  const load = b.node('table.query', { table: 'missing' });
  b.exec(open, 'next', load);
  await seed(b.project);
  await app.goto();

  await app.run();
  await expect(app.errorPill).toBeVisible();
  await expect(app.toasts().first()).toContainText('The table this block uses no longer exists');
});
