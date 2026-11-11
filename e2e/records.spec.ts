import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('a record variable gets its starting fields from the Variables panel', async ({ appNoBoot: app, seed }) => {
  const b = build('Contact');
  const contact = b.variable('contact', 'record', {});
  const label = b.element('text', 'Card');
  label.props.text = { kind: 'variable', variableId: contact.id };
  await seed(b.project);
  await app.goto();

  const item = app.variablesPanel.locator('.var-item', { hasText: 'contact' });
  await expect(item.locator('.var-type')).toHaveText('Record');
  await item.locator('.var-row').click();
  await item.getByRole('button', { name: '+ Add field' }).click();
  await item.getByLabel('Field 1 name').fill('name');
  await item.getByLabel('Field 1 value').fill('Ada');
  await item.getByRole('button', { name: '+ Add field' }).click();
  await item.getByLabel('Field 2 name').fill('city');
  await item.getByLabel('Field 2 value').fill('Paris');

  await app.run();
  await expect(app.designCanvas.locator('.el-text')).toHaveText('name: Ada, city: Paris');
  await expect(item.locator('.var-live')).toHaveText('= name: Ada, city: Paris');
  await app.stop();

  await item.getByRole('button', { name: 'Remove field “name”' }).click();
  await app.run();
  await expect(app.designCanvas.locator('.el-text')).toHaveText('city: Paris');
});

test('new record variables can be added from the panel', async ({ app }) => {
  await app.variablesPanel.getByRole('button', { name: '+ Record' }).click();
  const item = app.variablesPanel.locator('.var-item').last();
  await expect(item.locator('.var-name')).toHaveText('my record');
  await expect(item.locator('.var-type')).toHaveText('Record');
});

test.describe('record blocks', () => {
  test.beforeEach(async ({ appNoBoot: app, seed }) => {
    // Clicking "Show" reads the "city" field of a record made by "Make record".
    const b = build('Records');
    const button = b.element('button', 'Show', { label: 'Show' });
    const out = b.element('text', 'Out', { text: '' });
    const click = b.node('event.click', { element: button.id });
    const make = b.node('data.makeRecord', {}, { x: 40, y: 300 });
    const get = b.node('data.getField', { field: 'city' }, { x: 380, y: 300 });
    const set = b.node('action.setText', { element: out.id }, { x: 720, y: 40 });
    b.exec(click, 'next', set);
    b.data(make, 'value', get, 'record');
    b.data(get, 'value', set, 'text');
    await seed(b.project);
    await app.goto();
    await app.tab('Logic');
  });

  test('“Make record” fields can be renamed, added and removed on the block', async ({ appNoBoot: app }) => {
    const make = app.block('data.makeRecord');
    await expect(make.locator('.block-sentence')).toHaveText('Record with name, age');
    await expect(make.locator('.pin-row.in .pin-label')).toHaveText(['name', 'age']);

    await make.getByRole('button', { name: '+ Add field' }).click();
    await make.getByLabel('Field 3 name').fill('city');
    await expect(make.locator('.pin-row.in .pin-label')).toHaveText(['name', 'age', 'city']);
    await make.locator('.pin-row.in', { hasText: 'city' }).locator('input').fill('Lisbon');
    await make.getByRole('button', { name: 'Remove field “age”' }).click();
    await expect(make.locator('.pin-row.in .pin-label')).toHaveText(['name', 'city']);
    await expect(make.locator('.block-sentence')).toHaveText('Record with name, city');

    await app.run();
    await app.logicPreview.getByRole('button', { name: 'Show' }).click();
    await expect(app.logicPreview.locator('.el-text')).toHaveText('Lisbon');
  });

  test('two fields with the same name show an error on the block', async ({ appNoBoot: app }) => {
    const make = app.block('data.makeRecord');
    await make.getByLabel('Field 2 name').fill('Name');
    await expect(make.locator('.block-problem')).toHaveText('⚠ Two fields in this “Make record” block are called “Name”.');
  });

  test('a record output cannot be wired into a number input', async ({ appNoBoot: app }) => {
    await app.addBlock('Math');
    const math = app.block('data.math');
    await app.moveBlock(math, 0, 260);
    await app.connect(app.block('data.makeRecord'), 'value', math, 'a');
    await expect(app.edges).toHaveCount(3);
  });

  test('removing a field also removes the wire into it', async ({ appNoBoot: app }) => {
    await app.addBlock('Text');
    const text = app.block('data.text');
    await app.moveBlock(text, -300, 260);
    const make = app.block('data.makeRecord');
    const firstField = await make.locator('.react-flow__handle.target').first().getAttribute('data-handleid');
    await app.connect(text, 'value', make, firstField!);
    await expect(app.edges).toHaveCount(4);
    await make.getByRole('button', { name: 'Remove field “name”' }).click();
    await expect(app.edges).toHaveCount(3);
  });
});

test('a form adds records to a list and the list shows them', async ({ appNoBoot: app, seed }) => {
  const b = build('Guests');
  const people = b.variable('people', 'list', []);
  const box = b.element('input', 'Name Box', { placeholder: 'Name' });
  const button = b.element('button', 'Add', { label: 'Add' });
  const list = b.element('list', 'Guest List');
  list.props.items = { kind: 'variable', variableId: people.id };
  const click = b.node('event.click', { element: button.id });
  const name = b.node('data.getInputValue', { element: box.id });
  const make = b.node('data.makeRecord', {
    fields: [
      { id: 'n', name: 'name' },
      { id: 's', name: 'seats' },
    ],
    f_s: '2',
  });
  const add = b.node('action.addToList', { variable: people.id });
  b.exec(click, 'next', add);
  b.data(name, 'value', make, 'f_n');
  b.data(make, 'value', add, 'item');
  await seed(b.project);
  await app.goto();

  await app.run();
  const input = app.designCanvas.locator('input.el-input');
  for (const guest of ['Ada', 'Bo']) {
    await input.fill(guest);
    await app.designCanvas.getByRole('button', { name: 'Add' }).click();
  }
  await expect(app.designCanvas.locator('.list-row span')).toHaveText(['name: Ada, seats: 2', 'name: Bo, seats: 2']);
});

test('“Set field of variable” updates one field', async ({ appNoBoot: app, seed }) => {
  const b = build('Profile');
  const profile = b.variable('profile', 'record', { name: 'Ada', city: 'Paris' });
  const box = b.element('input', 'City Box', { placeholder: 'City' });
  const button = b.element('button', 'Save', { label: 'Save' });
  const card = b.element('text', 'Card');
  card.props.text = { kind: 'variable', variableId: profile.id };
  const click = b.node('event.click', { element: button.id });
  const city = b.node('data.getInputValue', { element: box.id });
  const setField = b.node('action.setVariableField', { variable: profile.id, field: 'city' });
  b.exec(click, 'next', setField);
  b.data(city, 'value', setField, 'value');
  await seed(b.project);
  await app.goto();

  await app.run();
  const text = app.designCanvas.locator('.el-text');
  await expect(text).toHaveText('name: Ada, city: Paris');
  await app.designCanvas.locator('input.el-input').fill('Rome');
  await app.designCanvas.getByRole('button', { name: 'Save' }).click();
  await expect(text).toHaveText('name: Ada, city: Rome');
});
