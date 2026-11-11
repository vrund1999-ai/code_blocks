import { expect, test } from './support/fixtures';
import { build } from './support/projects';

/** A List bound to a list of people records, with a "Name" text and a "Say hi" button in its card. */
function peopleProject(opts: { withCard?: boolean; people?: unknown[] } = {}) {
  const b = build('People');
  const people = b.variable('people', 'list', opts.people ?? [{ name: 'Ada', city: 'Paris' }, { name: 'Bo', city: 'Rome' }]);
  const list = b.element('list', 'People List');
  list.props.items = { kind: 'variable', variableId: people.id };
  let name, hi;
  if (opts.withCard !== false) {
    name = b.element('text', 'Name', {}, list);
    name.props.text = { kind: 'item', field: 'name' };
    hi = b.element('button', 'Say hi', { label: 'Say hi' }, list);
  }
  return { b, people, list, name, hi };
}

test.describe('designing a card', () => {
  test.fixme(({ browserName }) => browserName !== 'chromium', 'QE-11: drag tests only run in Chromium for now');

  test('dropping a Text into a List turns it into a card linked to item fields', async ({ appNoBoot: app, seed }) => {
    const { b } = peopleProject({ withCard: false });
    await seed(b.project);
    await app.goto();

    const list = app.element('People List');
    await expect(list.locator('.list-row span')).toHaveText(['name: Ada, city: Paris', 'name: Bo, city: Rome']);
    await expect(list.locator('.list-hint')).toHaveText('Drop elements here to show each item as a card');

    await app.dragPaletteItem('Text', list, 'inside');
    await expect(list.locator('.list-card.template .el-text')).toHaveText('Some text');
    await expect(list.locator('.list-hint')).toHaveText('↻ This card repeats for each item in the list');

    // Link the text to the "city" field of each card's item.
    await app.inspectorField('Text').getByRole('button', { name: /link/ }).click();
    await expect(app.inspector.getByLabel('Text: linked to')).toHaveValue('__item');
    await app.inspector.getByLabel('Text: item field').fill('city');
    await expect(list.locator('.list-card.template .el-text')).toHaveText('Paris');

    await app.run();
    await expect(app.designCanvas.locator('.list-card .el-text')).toHaveText(['Paris', 'Rome']);
  });

  test('text boxes cannot be dropped into a card', async ({ appNoBoot: app, seed }) => {
    const { b } = peopleProject();
    await seed(b.project);
    await app.goto();

    await app.dragPaletteItem('Text Box', app.element('Name'), 'after');
    await expect(app.designCanvas.locator('.list-card input.el-input')).toHaveCount(0);
    await expect(app.designCanvas.locator('input.el-input')).toHaveCount(0);

    // The same drop with an element that is allowed lands in the card.
    await app.dragPaletteItem('Text', app.element('Name'), 'after');
    await expect(app.designCanvas.locator('.list-card.template .el-text')).toHaveCount(2);
  });
});

test('click-to-add puts allowed elements into the selected card and the rest on the screen', async ({
  appNoBoot: app,
  seed,
}) => {
  const { b } = peopleProject();
  await seed(b.project);
  await app.goto();

  await app.select('Name');
  await app.page.locator('.palette-item', { hasText: 'Image' }).click();
  await expect(app.designCanvas.locator('.list-card.template .el-image')).toHaveCount(1);

  await app.select('Name');
  await app.page.locator('.palette-item', { hasText: 'Checkbox' }).click();
  await expect(app.designCanvas.locator('.list-card .el-checkbox')).toHaveCount(0);
  expect(await app.topLevelNames()).toEqual(['People List', 'Checkbox 1']);
});

test('the designer shows field names when the list has no starting items', async ({ appNoBoot: app, seed }) => {
  const { b } = peopleProject({ people: [] });
  await seed(b.project);
  await app.goto();
  await expect(app.designCanvas.locator('.list-card.template .el-text')).toHaveText('‹name›');
  await app.run();
  await expect(app.designCanvas.locator('.list-empty')).toHaveText('Nothing here yet');
});

test('a button in a card tells "When button clicked" which item it belongs to', async ({ appNoBoot: app, seed }) => {
  const { b, hi } = peopleProject();
  const click = b.node('event.click', { element: hi!.id });
  const field = b.node('data.getField', { field: 'name' });
  const join = b.node('data.join', { a: 'Hi ' });
  const say = b.node('action.toast');
  const pos = b.node('action.toast');
  b.exec(click, 'next', say);
  b.exec(say, 'next', pos);
  b.data(click, 'item', field, 'record');
  b.data(field, 'value', join, 'b');
  b.data(join, 'value', say, 'message');
  b.data(click, 'index', pos, 'message');
  await seed(b.project);
  await app.goto();

  await app.tab('Logic');
  const event = app.block('event.click');
  await expect(event.locator('.pin-row.out .pin-label')).toHaveText(['List item', 'Position']);

  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Say hi' }).nth(1).click();
  await expect(app.toasts(app.logicPreview)).toHaveText(['Hi Bo', '2']);
});

test('the delete button on a card removes its item', async ({ appNoBoot: app, seed }) => {
  const { b, people } = peopleProject();
  const del = b.node('event.listDelete', { element: b.root.children[0].id });
  const remove = b.node('action.removeFromList', { variable: people.id });
  b.exec(del, 'next', remove);
  b.data(del, 'index', remove, 'index');
  await seed(b.project);
  await app.goto();

  await app.run();
  const names = app.designCanvas.locator('.list-card .el-text');
  await expect(names).toHaveText(['Ada', 'Bo']);
  await app.designCanvas.locator('.list-row').first().getByRole('button', { name: 'Delete' }).click();
  await expect(names).toHaveText(['Bo']);
});

test('records added while the app runs appear as new cards', async ({ appNoBoot: app, seed }) => {
  const { b, people } = peopleProject({ people: [] });
  const box = b.element('input', 'Name Box', { placeholder: 'Name' });
  const add = b.element('button', 'Add', { label: 'Add' });
  const click = b.node('event.click', { element: add.id });
  const typed = b.node('data.getInputValue', { element: box.id });
  const make = b.node('data.makeRecord', { fields: [{ id: 'n', name: 'name' }] });
  const push = b.node('action.addToList', { variable: people.id });
  b.exec(click, 'next', push);
  b.data(typed, 'value', make, 'f_n');
  b.data(make, 'value', push, 'item');
  await seed(b.project);
  await app.goto();

  await app.run();
  for (const guest of ['Cy', 'Di']) {
    await app.designCanvas.locator('input.el-input').fill(guest);
    await app.designCanvas.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await expect(app.designCanvas.locator('.list-card .el-text')).toHaveText(['Cy', 'Di']);
});
