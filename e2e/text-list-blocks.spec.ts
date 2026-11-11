import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('the palette groups text and list blocks', async ({ app }) => {
  await app.tab('Logic');
  const titles = app.page.locator('.node-palette .node-cat-title');
  await expect(titles).toContainText(['When…', 'Do…', 'Decide & repeat', 'Values', 'Text', 'Lists & records']);
  const text = app.page.locator('.node-cat', { has: app.page.locator('.node-cat-title', { hasText: /^Text/ }) });
  await expect(text.locator('.node-item')).toHaveText([
    'Join text',
    'Change text',
    'Text contains',
    'Text length',
    'Replace text',
    'Split text',
  ]);

  await app.blockSearch.fill('sort');
  await expect(app.page.locator('.node-palette .node-item')).toHaveText(['Sort list']);
  await app.blockSearch.fill('');
  await app.addBlock('Filter list');
  await expect(app.block('list.filter').locator('.block-sentence')).toHaveText('Keep items where item = …');
});

test('split, sort, join and change text work together', async ({ appNoBoot: app, seed }) => {
  // "pear, Apple, fig" → ["pear", "Apple", "fig"] → sorted → "APPLE · FIG · PEAR"
  const b = build('Fruit');
  const box = b.element('input', 'Fruit Box', { placeholder: 'Fruit' });
  const button = b.element('button', 'Tidy', { label: 'Tidy' });
  const out = b.element('text', 'Out', { text: '' });
  const click = b.node('event.click', { element: button.id });
  const typed = b.node('data.getInputValue', { element: box.id });
  const split = b.node('text.split', {});
  const sort = b.node('list.sort', {});
  const join = b.node('list.join', { separator: ' · ' });
  const upper = b.node('text.case', { op: 'upper' });
  const set = b.node('action.setText', { element: out.id });
  b.exec(click, 'next', set);
  b.data(typed, 'value', split, 'text');
  b.data(split, 'value', sort, 'list');
  b.data(sort, 'value', join, 'list');
  b.data(join, 'value', upper, 'text');
  b.data(upper, 'value', set, 'text');
  await seed(b.project);
  await app.goto();

  await app.run();
  await app.designCanvas.locator('input.el-input').fill('pear, Apple, fig');
  await app.designCanvas.getByRole('button', { name: 'Tidy' }).click();
  await expect(app.designCanvas.locator('.el-text')).toHaveText('APPLE · FIG · PEAR');

  // Switch the sort order on the block and run again.
  await app.stop();
  await app.tab('Logic');
  await app.block('list.sort').getByLabel('Order').selectOption('desc');
  await expect(app.block('list.sort').locator('.block-sentence')).toHaveText('Sort list, Z → A');
  await app.run();
  await app.logicPreview.locator('input.el-input').fill('pear, Apple, fig');
  await app.logicPreview.getByRole('button', { name: 'Tidy' }).click();
  await expect(app.logicPreview.locator('.el-text')).toHaveText('PEAR · FIG · APPLE');
});

test('typing in a search box filters List cards', async ({ appNoBoot: app, seed }) => {
  const b = build('Search');
  const everyone = [
    { name: 'Ada', city: 'London' },
    { name: 'Bo', city: 'Rome' },
    { name: 'Adrian', city: 'Paris' },
  ];
  const people = b.variable('people', 'list', everyone);
  const shown = b.variable('shown', 'list', everyone);
  const search = b.element('input', 'Search', { placeholder: 'Search' });
  const list = b.element('list', 'People List');
  list.props.items = { kind: 'variable', variableId: shown.id };
  const name = b.element('text', 'Name', {}, list);
  name.props.text = { kind: 'item', field: 'name' };
  const changed = b.node('event.inputChange', { element: search.id });
  const all = b.node('data.getVariable', { variable: people.id });
  const filter = b.node('list.filter', { field: 'name', op: 'contains' });
  const save = b.node('action.setVariable', { variable: shown.id });
  b.exec(changed, 'next', save);
  b.data(all, 'value', filter, 'list');
  b.data(changed, 'value', filter, 'value');
  b.data(filter, 'value', save, 'value');
  await seed(b.project);
  await app.goto();

  await app.run();
  const names = app.designCanvas.locator('.list-card .el-text');
  await expect(names).toHaveText(['Ada', 'Bo', 'Adrian']);
  const box = app.designCanvas.locator('input.el-input');
  await box.fill('ad');
  await expect(names).toHaveText(['Ada', 'Adrian']);
  await box.fill('bo');
  await expect(names).toHaveText(['Bo']);
  await box.fill('');
  await expect(names).toHaveText(['Ada', 'Bo', 'Adrian']);
});

test('“is empty” checks have no Value input, and its wire is removed', async ({ appNoBoot: app, seed }) => {
  const b = build('Filter');
  const filter = b.node('list.filter', {});
  const text = b.node('data.text', { value: 'x' }, { x: 40, y: 400 });
  b.data(text, 'value', filter, 'value');
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');

  const block = app.block('list.filter');
  await expect(block.locator('.pin-row.in .pin-label')).toHaveText(['List', 'Field (for records)', 'Value']);
  await expect(app.edges).toHaveCount(1);
  await block.getByLabel('Keep items that').selectOption('notEmpty');
  await expect(block.locator('.pin-row.in .pin-label')).toHaveText(['List', 'Field (for records)']);
  await expect(block.locator('.block-sentence')).toHaveText('Keep items where item is not empty');
  await expect(app.edges).toHaveCount(0);
});

test('insert into a list and change an item while the app runs', async ({ appNoBoot: app, seed }) => {
  const b = build('Queue');
  const queue = b.variable('queue', 'list', ['b', 'c']);
  const first = b.element('button', 'First', { label: 'Put first' });
  const rename = b.element('button', 'Rename', { label: 'Rename second' });
  const list = b.element('list', 'Queue List');
  list.props.items = { kind: 'variable', variableId: queue.id };
  const clickFirst = b.node('event.click', { element: first.id });
  const insert = b.node('action.insertInList', { variable: queue.id, item: 'a', index: 1 });
  const clickRename = b.node('event.click', { element: rename.id });
  const change = b.node('action.setListItem', { variable: queue.id, index: 2, item: 'B!' });
  b.exec(clickFirst, 'next', insert);
  b.exec(clickRename, 'next', change);
  await seed(b.project);
  await app.goto();

  await app.run();
  const rows = app.designCanvas.locator('.list-row span');
  await expect(rows).toHaveText(['b', 'c']);
  await app.designCanvas.getByRole('button', { name: 'Put first' }).click();
  await expect(rows).toHaveText(['a', 'b', 'c']);
  await app.designCanvas.getByRole('button', { name: 'Rename second' }).click();
  await expect(rows).toHaveText(['a', 'B!', 'c']);
});

test('“Text contains” drives an If block', async ({ appNoBoot: app, seed }) => {
  const b = build('Email');
  const box = b.element('input', 'Email', { placeholder: 'Email' });
  const button = b.element('button', 'Check', { label: 'Check' });
  const click = b.node('event.click', { element: button.id });
  const typed = b.node('data.getInputValue', { element: box.id });
  const contains = b.node('text.contains', { part: '@' });
  const decide = b.node('flow.if', {});
  const good = b.node('action.toast', { message: 'Looks good' });
  const bad = b.node('action.toast', { message: 'An email needs an @' });
  b.exec(click, 'next', decide);
  b.exec(decide, 'then', good);
  b.exec(decide, 'else', bad);
  b.data(typed, 'value', contains, 'text');
  b.data(contains, 'value', decide, 'condition');
  await seed(b.project);
  await app.goto();

  await app.run();
  const input = app.designCanvas.locator('input.el-input');
  await input.fill('ada.example.com');
  await app.designCanvas.getByRole('button', { name: 'Check' }).click();
  await expect(app.toasts().last()).toHaveText('An email needs an @');
  await input.fill('ada@example.com');
  await app.designCanvas.getByRole('button', { name: 'Check' }).click();
  await expect(app.toasts().last()).toHaveText('Looks good');
});
