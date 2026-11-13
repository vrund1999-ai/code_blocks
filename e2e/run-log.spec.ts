import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('the run log lists each block that ran, with its values', async ({ app }) => {
  await app.tab('Logic');
  const log = app.page.getByRole('region', { name: 'Run log' });
  const rows = log.locator('.log-row');
  await expect(log).toContainText('Press ▶ Run and use your app');

  await app.run();
  await app.logicPreview.locator('input.el-input').fill('Ada');
  await app.logicPreview.locator('button.el-button').click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveClass(/log-event/);
  await expect(rows.nth(0)).toContainText('▶ When “Say Hello” is clicked');
  await expect(rows.nth(0).locator('.log-time')).toHaveText(/\d{1,2}:\d{2}:\d{2}/);
  await expect(rows.nth(1)).toContainText('Set text of “Greeting”');
  await expect(rows.nth(1).locator('.log-value')).toHaveText('Text: “Hello, Ada”');
  await expect(log.locator('.run-log-count')).toHaveText('2 steps');

  // Clicking a line shows its block.
  await rows.nth(1).click();
  await expect(app.inspector).toContainText('Set text');
  await expect(app.block('action.setText')).toHaveClass(/selected/);

  // A second click adds another group.
  await app.logicPreview.locator('button.el-button').click();
  await expect(rows).toHaveCount(4);

  // The log stays after Stop, and clears when the app runs again.
  await app.stop();
  await expect(rows).toHaveCount(4);
  await app.run();
  await expect(rows).toHaveCount(0);
  await expect(log).toContainText('Use your app');
});

test('the run log shows what an event carried, errors, and can be cleared or closed', async ({
  appNoBoot: app,
  seed,
}) => {
  const b = build('Log');
  const box = b.element('input', 'Name Box', { placeholder: 'Name' });
  const changed = b.node('event.inputChange', { element: box.id });
  const message = b.node('action.toast');
  const broken = b.node('action.setText'); // no element picked
  b.exec(changed, 'next', message);
  b.exec(message, 'next', broken);
  b.data(changed, 'value', message, 'message');
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');
  const log = app.page.getByRole('region', { name: 'Run log' });
  const rows = log.locator('.log-row');

  await app.run();
  await app.logicPreview.getByPlaceholder('Name').fill('Bo');
  await expect(rows.filter({ hasText: 'When “Name Box” changes' }).locator('.log-value')).toHaveText('New value: “Bo”');
  await expect(rows.filter({ hasText: 'Show a message' }).locator('.log-value')).toHaveText('Message: “Bo”');
  const error = log.locator('.log-error');
  await expect(error).toHaveText('⚠ This “Set text” block has no element picked.');

  // Clicking the error shows the broken block.
  await error.click();
  await expect(app.block('action.setText')).toHaveClass(/selected/);

  await log.getByRole('button', { name: 'Clear' }).click();
  await expect(rows).toHaveCount(0);

  await log.getByRole('button', { name: /Run log/ }).click();
  await expect(log.getByRole('button', { name: /Run log/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(log.locator('.run-log-list')).toHaveCount(0);
});
