import { expect, test } from './support/fixtures';
import { build, template } from './support/projects';

test.describe('variables', () => {
  test('adds, renames and retypes a variable', async ({ app }) => {
    const panel = app.variablesPanel;
    await panel.getByRole('button', { name: '+ Number' }).click();
    const item = panel.locator('.var-item').last();
    await expect(item.locator('.var-name')).toHaveText('my number');
    await expect(item.locator('.var-type')).toHaveText('Number');

    await item.getByLabel('Name').fill('score');
    await expect(item.locator('.var-name')).toHaveText('score');
    await item.getByLabel('Kind').selectOption('text');
    await expect(item.locator('.var-type')).toHaveText('Text');
  });

  test('new variables get unique names', async ({ app }) => {
    const panel = app.variablesPanel;
    await panel.getByRole('button', { name: '+ List' }).click();
    await panel.getByRole('button', { name: '+ List' }).click();
    await expect(panel.locator('.var-name')).toHaveText(['my list', 'my list 2']);
  });

  test('shows live values while the app runs', async ({ appNoBoot: app, seed }) => {
    await seed(template('counter'));
    await app.goto();
    await app.run();
    await app.designCanvas.getByRole('button', { name: '+ 1' }).click();
    await expect(app.variablesPanel.locator('.var-live')).toHaveText('= 1');
  });

  test('deleting a variable clears blocks that used it', async ({ app }) => {
    await app.loadTemplate('Counter');
    await app.tab('Logic');
    const picker = app.block('action.changeVariable').locator('select').first();
    await expect(picker.locator('option:checked')).toHaveText('count');

    const item = app.variablesPanel.locator('.var-item', { hasText: 'count' });
    await item.locator('.var-row').click();
    await item.getByRole('button', { name: 'Delete variable' }).click();
    await expect(app.variablesPanel.locator('.var-item')).toHaveCount(0);
    await expect(picker).toHaveValue('');
    await expect(app.block('action.changeVariable').locator('.block-problem')).toBeVisible();
  });
});

test.describe('screens', () => {
  test('adds, renames, switches and deletes screens', async ({ app, page }) => {
    const panel = app.screensPanel;
    await panel.getByRole('button', { name: '+ Add screen' }).click();
    await expect(panel.locator('.screen-item')).toHaveCount(2);
    await panel.locator('.screen-item').nth(1).click();
    await expect(panel.locator('.screen-item').nth(1)).toHaveClass(/active/);
    await expect(app.designCanvas.locator('.device-title')).toHaveText('Screen');

    await panel.locator('.screen-item').nth(1).locator('.screen-name').dblclick();
    const input = panel.locator('.screen-item').nth(1).locator('input');
    await input.fill('Settings');
    await input.press('Enter');
    await expect(panel.locator('.screen-name').nth(1)).toHaveText(/Settings/);
    await expect(app.designCanvas.locator('.device-title')).toHaveText('Settings');
    await expect(app.rootElement.locator('.empty-hint')).toBeVisible();

    await panel.locator('.screen-item').nth(1).getByTitle('Delete screen').click();
    await expect(panel.locator('.screen-item')).toHaveCount(1);
    await expect(page.locator('.screen-item button[title="Delete screen"]')).toHaveCount(0);
  });

  test('Go to screen navigates and fires that screen’s open event', async ({ appNoBoot: app, seed }) => {
    const b = build('Two Screens');
    const next = b.element('button', 'Next', { label: 'Next' });
    const details = b.addScreen('Details');
    const status = b.element('text', 'Status', { text: 'waiting' }, details.root);
    const click = b.node('event.click', { element: next.id });
    const go = b.node('action.goToScreen', { screen: details.id });
    const opened = b.node('event.screenLoad', { screen: details.id });
    const set = b.node('action.setText', { element: status.id, text: 'Loaded!' });
    b.exec(click, 'next', go);
    b.exec(opened, 'next', set);
    await seed(b.project);
    await app.goto();

    await app.run();
    await app.designCanvas.getByRole('button', { name: 'Next' }).click();
    await expect(app.designCanvas.locator('.el-text')).toHaveText('Loaded!');
    await app.stop();
    // The editor stays on the screen being designed.
    await expect(app.designCanvas.locator('.el-button')).toHaveText('Next');
  });

  test('deleting an element clears blocks that pointed at it', async ({ app }) => {
    await app.select('Greeting');
    await app.page.keyboard.press('Delete');
    await app.tab('Logic');
    await expect(app.block('action.setText').locator('select').first()).toHaveValue('');
    await expect(app.block('action.setText').locator('.block-problem')).toContainText('no element picked');
  });
});
