import { expect, test } from './support/fixtures';

test('Blank app starts with an empty screen', async ({ app }) => {
  await app.loadTemplate('Blank app');
  await expect(app.rootElement.locator('.empty-hint')).toHaveText('Drag elements here from the left');
  await app.tab('Logic');
  await expect(app.blocks).toHaveCount(0);
});

test('Counter adds and subtracts', async ({ app }) => {
  await app.loadTemplate('Counter');
  await app.run();
  const display = app.designCanvas.locator('.el-text').nth(1);
  await expect(display).toHaveText('0');
  const plus = app.designCanvas.getByRole('button', { name: '+ 1' });
  const minus = app.designCanvas.getByRole('button', { name: '− 1' });
  await plus.click();
  await plus.click();
  await plus.click();
  await expect(display).toHaveText('3');
  await minus.click();
  await expect(display).toHaveText('2');

  // Running again starts from the variable's starting value.
  await app.stop();
  await app.run();
  await expect(display).toHaveText('0');
});

test.describe('To-do List', () => {
  test.beforeEach(async ({ app }) => {
    await app.loadTemplate('To-do List');
    await app.run();
  });

  test('warns when adding an empty task', async ({ app }) => {
    await app.designCanvas.getByRole('button', { name: 'Add' }).click();
    await expect(app.toasts(app.designCanvas).first()).toContainText('Type a task');
    await expect(app.designCanvas.locator('.list-row')).toHaveCount(0);
    await expect(app.designCanvas.locator('.list-empty')).toBeVisible();
  });

  test('adds tasks with the button and with Enter, then deletes one', async ({ app }) => {
    const input = app.designCanvas.locator('input.el-input');
    const rows = app.designCanvas.locator('.list-row span');
    await input.fill('Buy milk');
    await app.designCanvas.getByRole('button', { name: 'Add' }).click();
    await expect(rows).toHaveText(['Buy milk']);
    await expect(input).toHaveValue('');

    for (const t of ['Walk dog', 'Call mum']) {
      await input.fill(t);
      await input.press('Enter');
      await expect(input).toHaveValue('');
    }
    await expect(rows).toHaveText(['Buy milk', 'Walk dog', 'Call mum']);

    await app.designCanvas.locator('.list-row').nth(1).locator('.list-delete').click();
    await expect(rows).toHaveText(['Buy milk', 'Call mum']);
  });
});
