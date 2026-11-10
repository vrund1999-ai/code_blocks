import { expect, test } from './support/fixtures';

test('boots into the Hello Name starter project', async ({ app, page }) => {
  await expect(page).toHaveTitle(/Code Blocks/);
  await expect(app.projectName).toHaveValue('Hello Name');
  await expect(page.locator('button.tab.active')).toHaveText(/Design/);
  await expect(app.element('Title')).toBeVisible();
  await expect(app.element('Name Box')).toBeVisible();
  await expect(app.element('Say Hello')).toBeVisible();
  await expect(app.element('Greeting')).toBeVisible();
  await expect(app.runButton).toBeVisible();
  await expect(app.undoButton).toBeDisabled();
  await expect(app.redoButton).toBeDisabled();
});

test('has an inline favicon (no 404)', async ({ page, app }) => {
  await expect(app.projectName).toBeVisible();
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toMatch(/^data:image\/svg\+xml/);
});

test('shows helpful empty states', async ({ app }) => {
  await expect(app.inspector).toContainText('Click an element on the screen');
  await app.tab('Logic');
  await expect(app.inspector).toContainText('Click a block');
});
