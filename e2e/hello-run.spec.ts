import { expect, test } from './support/fixtures';

test.describe('running Hello Name', () => {
  test('greets the typed name in the Design tab', async ({ app }) => {
    const canvas = app.designCanvas;
    await app.run();
    await expect(canvas.locator('.running-note')).toBeVisible();
    await canvas.locator('input.el-input').fill('Ada');
    await canvas.locator('button.el-button').click();
    await expect(canvas.locator('.el-text').nth(1)).toHaveText('Hello, Ada');
  });

  test('Stop restores the designed text', async ({ app }) => {
    const canvas = app.designCanvas;
    await app.run();
    await canvas.locator('input.el-input').fill('Ada');
    await canvas.locator('button.el-button').click();
    await expect(canvas.locator('.el-text').nth(1)).toHaveText('Hello, Ada');
    await app.stop();
    await expect(canvas.locator('.el-text').nth(1)).toHaveText('Your greeting will appear here');
    await expect(canvas.locator('.running-note')).toBeHidden();
  });

  test('runs from the Logic preview and lights up blocks', async ({ app }) => {
    await app.tab('Logic');
    const preview = app.logicPreview;
    await expect(preview).toContainText('Preview');
    await app.run();
    await expect(preview).toContainText('Your app (running)');
    await preview.locator('input.el-input').fill('Bo');
    await preview.locator('button.el-button').click();
    await expect(preview.locator('.el-text').nth(1)).toHaveText('Hello, Bo');
    await expect(app.block('action.setText').locator('.block')).toHaveClass(/flash/);
    // The flash fades out again.
    await expect(app.page.locator('.block.flash')).toHaveCount(0);
  });

  test('the preview panel can be hidden and shown', async ({ app, page }) => {
    await app.tab('Logic');
    await app.logicPreview.locator('button[title="Hide preview"]').click();
    await expect(app.logicPreview).toBeHidden();
    await page.locator('.preview-tab').click();
    await expect(app.logicPreview).toBeVisible();
  });
});
