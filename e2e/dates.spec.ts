import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('date blocks count days, show today and report dates they can’t read', async ({ appNoBoot: app, seed, page }) => {
  // Sunday 15 November 2026, 2:30 PM, on the browser's clock.
  await page.clock.setFixedTime(new Date(2026, 10, 15, 14, 30));

  const b = build('Countdown');
  const today = b.element('text', 'Today', { text: '' });
  const when = b.element('input', 'When', { placeholder: 'When' });
  const count = b.element('button', 'Count', { label: 'Count' });
  const left = b.element('text', 'Left', { text: '' });
  // When the screen opens: show today's date.
  const open = b.node('event.screenLoad', { screen: b.screen.id });
  const now = b.node('date.now');
  const show = b.node('date.format', { format: 'full' });
  const setToday = b.node('action.setText', { element: today.id });
  b.exec(open, 'next', setToday);
  b.data(now, 'value', show, 'date');
  b.data(show, 'value', setToday, 'text');
  // Count: the whole days from today to the date typed in.
  const click = b.node('event.click', { element: count.id });
  const read = b.node('data.getInputValue', { element: when.id });
  const between = b.node('date.between', { unit: 'days' });
  const setLeft = b.node('action.setText', { element: left.id });
  b.exec(click, 'next', setLeft);
  b.data(read, 'value', between, 'to');
  b.data(between, 'value', setLeft, 'text');
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');

  const block = app.block('date.between');
  await expect(block.locator('.block-sentence')).toHaveText('Whole days between two dates');
  // "From" is left empty, which means today.
  await expect(block.getByLabel('From')).toHaveAttribute('placeholder', 'today');

  await app.run();
  const preview = app.logicPreview;
  await expect(preview.locator('.el-text').first()).toHaveText('Sunday 15 November 2026');
  await preview.getByPlaceholder('When').fill('2026-12-25');
  await preview.getByRole('button', { name: 'Count' }).click();
  await expect(preview.locator('.el-text').last()).toHaveText('40');

  await block.getByLabel('Count').selectOption('weeks');
  await expect(block.locator('.block-sentence')).toHaveText('Whole weeks between two dates');
  await preview.getByRole('button', { name: 'Count' }).click();
  await expect(preview.locator('.el-text').last()).toHaveText('5');

  // A date written another way stops the block, saying how to write it.
  await preview.getByPlaceholder('When').fill('25/12/2026');
  await preview.getByRole('button', { name: 'Count' }).click();
  await expect(app.errorPill).toBeVisible();
  await expect(app.toasts().first()).toContainText('“25/12/2026” isn’t a date. Write dates like 2026-11-15');
  await expect(block.locator('.block')).toHaveClass(/has-error/);
});

test('the date blocks have their own place in the palette', async ({ app }) => {
  await app.tab('Logic');
  const category = app.page.locator('.node-cat', { has: app.page.locator('.node-cat-title', { hasText: 'Dates & times' }) });
  await expect(category.locator('.node-item')).toHaveText(['Today / now', 'Show date', 'Add to date', 'Time between dates', 'Compare dates', 'Part of date']);

  await app.addBlock('Add to date');
  const add = app.block('date.add');
  await expect(add.locator('.block-sentence')).toHaveText('Add 1 day to a date');
  await expect(add.locator('.pin-row.in .pin-label')).toHaveText(['Date', 'Add']);
  await add.getByLabel('Add', { exact: true }).fill('-2');
  await expect(add.locator('.block-sentence')).toHaveText('Take 2 days from a date');
});
