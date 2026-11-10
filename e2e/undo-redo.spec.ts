import { expect, test } from './support/fixtures';

test('undo and redo buttons follow the history', async ({ app }) => {
  await expect(app.undoButton).toBeDisabled();
  await expect(app.redoButton).toBeDisabled();

  await app.paletteItem('Text').click();
  await expect(app.undoButton).toBeEnabled();
  await expect(app.redoButton).toBeDisabled();

  await app.undoButton.click();
  expect(await app.topLevelNames()).toHaveLength(4);
  await expect(app.undoButton).toBeDisabled();
  await expect(app.redoButton).toBeEnabled();

  await app.redoButton.click();
  expect(await app.topLevelNames()).toHaveLength(5);
  await expect(app.redoButton).toBeDisabled();
});

test('keyboard shortcuts undo and redo in the Design tab', async ({ app, page }) => {
  await app.select('Greeting');
  await page.keyboard.press('Delete');
  expect(await app.topLevelNames()).not.toContain('Greeting');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(app.element('Greeting')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(app.element('Greeting')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(app.element('Greeting')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+y');
  await expect(app.element('Greeting')).toHaveCount(0);
});

test('undo restores a deleted block and its wires', async ({ app, page }) => {
  await app.tab('Logic');
  await app.block('data.join').locator('.block-header').click();
  await page.keyboard.press('Delete');
  await expect(app.blocks).toHaveCount(3);
  await expect(app.edges).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(app.blocks).toHaveCount(4);
  await expect(app.edges).toHaveCount(3);
});

test('typing in a text field does not trigger editor shortcuts', async ({ app }) => {
  await app.select('Title');
  const field = app.inspectorField('Text').locator('textarea');
  await field.fill('Changed');
  await field.press('Backspace');
  // Backspace edited the text instead of deleting the element.
  await expect(field).toHaveValue('Change');
  await expect(app.element('Title')).toBeVisible();
});

test('rapid typing is undone in one step', async ({ app }) => {
  await app.projectName.click();
  await app.projectName.press('End');
  await app.projectName.pressSequentially('!!!');
  await expect(app.projectName).toHaveValue('Hello Name!!!');
  await app.undoButton.click();
  await expect(app.projectName).toHaveValue('Hello Name');
});
