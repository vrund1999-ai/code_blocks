import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('data wires show the values passing through them while the app runs', async ({ app }) => {
  await app.tab('Logic');
  const values = app.page.locator('.react-flow .wire-value');
  // Nothing to show before the app runs.
  await expect(app.edges).toHaveCount(3);
  await expect(values).toHaveCount(0);

  await app.run();
  await expect(values).toHaveCount(0);
  await app.logicPreview.locator('input.el-input').fill('Ada');
  await app.logicPreview.locator('button.el-button').click();
  await expect(app.logicPreview.locator('.el-text').nth(1)).toHaveText('Hello, Ada');
  // The typed name goes into the join, and the greeting comes out.
  await expect(values).toHaveCount(2);
  await expect(values.getByText('“Ada”', { exact: true })).toBeVisible();
  await expect(values.getByText('“Hello, Ada”', { exact: true })).toHaveAttribute('title', 'Hello, Ada');

  // A new value replaces the old one.
  await app.logicPreview.locator('input.el-input').fill('Bo');
  await app.logicPreview.locator('button.el-button').click();
  await expect(values.getByText('“Bo”', { exact: true })).toBeVisible();
  await expect(values.getByText('“Hello, Bo”', { exact: true })).toBeVisible();
  await expect(values).toHaveCount(2);

  // Stop clears them.
  await app.stop();
  await expect(values).toHaveCount(0);
});

test('a wire in a loop shows its last value, and lists are summed up', async ({ appNoBoot: app, seed }) => {
  const b = build('Loop');
  const go = b.element('button', 'Go', { label: 'Go' });
  const out = b.element('text', 'Out', { text: '' });
  const names = b.variable('names', 'list', ['Ada', 'Bo']);
  const click = b.node('event.click', { element: go.id });
  const repeat = b.node('flow.repeat', { times: 4 });
  const show = b.node('action.setText', { element: out.id });
  const getList = b.node('data.getVariable', { variable: names.id });
  const store = b.node('action.setVariable', { variable: names.id });
  b.exec(click, 'next', repeat);
  b.exec(repeat, 'body', show);
  b.data(repeat, 'count', show, 'text');
  b.exec(repeat, 'done', store);
  b.data(getList, 'value', store, 'value');
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');

  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Go' }).click();
  await expect(app.logicPreview.locator('.el-text')).toHaveText('4');
  const values = app.page.locator('.react-flow .wire-value');
  await expect(values).toHaveCount(2);
  await expect(values.filter({ hasText: /^4$/ })).toHaveCount(1);
  const list = values.filter({ hasText: 'list of 2 items' });
  await expect(list).toHaveAttribute('title', /"Ada",\s+"Bo"/);
});
