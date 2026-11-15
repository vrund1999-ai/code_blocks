import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('Round number and the new Math operations work in a running app', async ({ appNoBoot: app, seed }) => {
  const b = build('Bill splitter');
  const bill = b.element('input', 'Bill', { placeholder: 'Bill' });
  const split = b.element('button', 'Split', { label: 'Split' });
  const share = b.element('text', 'Share', { text: '' });
  const click = b.node('event.click', { element: split.id });
  const read = b.node('data.getInputValue', { element: bill.id });
  const divide = b.node('data.math', { op: '/', b: 3 });
  const round = b.node('data.round', { places: 2 });
  const set = b.node('action.setText', { element: share.id });
  b.exec(click, 'next', set);
  b.data(read, 'value', divide, 'a');
  b.data(divide, 'value', round, 'a');
  b.data(round, 'value', set, 'text');
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');

  const roundBlock = app.block('data.round');
  const mathBlock = app.block('data.math');
  await expect(roundBlock.locator('.block-sentence')).toHaveText('Round to the nearest');

  await app.run();
  const preview = app.logicPreview;
  await preview.getByPlaceholder('Bill').fill('100');
  await preview.getByRole('button', { name: 'Split' }).click();
  await expect(preview.locator('.el-text')).toHaveText('33.33');

  // Changes apply while the app runs.
  await roundBlock.getByLabel('Round').selectOption('up');
  await expect(roundBlock.locator('.block-sentence')).toHaveText('Round up');
  await preview.getByRole('button', { name: 'Split' }).click();
  await expect(preview.locator('.el-text')).toHaveText('33.34');

  await mathBlock.getByLabel('Operation').selectOption({ label: 'remainder of A ÷ B' });
  await expect(mathBlock.locator('.block-sentence')).toHaveText('Remainder of A ÷ B');
  await preview.getByRole('button', { name: 'Split' }).click();
  await expect(preview.locator('.el-text')).toHaveText('1');

  await mathBlock.getByLabel('Operation').selectOption({ label: 'smaller of A and B' });
  await preview.getByRole('button', { name: 'Split' }).click();
  await expect(preview.locator('.el-text')).toHaveText('3');
});

test('Round number can be added from the palette', async ({ app }) => {
  await app.tab('Logic');
  await app.addBlock('Round number');
  const round = app.block('data.round');
  await expect(round).toBeVisible();
  await expect(round.getByLabel('Round')).toHaveValue('nearest');
  await expect(round.locator('.pin-row.in .pin-label')).toHaveText(['Number', 'Decimal places']);
});
