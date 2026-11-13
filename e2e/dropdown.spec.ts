import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('add a dropdown and type its choices', async ({ appNoBoot: app, seed }) => {
  await seed(build('Empty').project);
  await app.goto();
  await app.paletteItem('Dropdown').click();
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Dropdown 1');
  const dropdown = app.designCanvas.getByRole('combobox', { name: 'Dropdown 1' });
  await expect(dropdown.locator('option')).toHaveText(['Choose…', 'Small', 'Medium', 'Large']);

  await app.inspectorField('Choices').locator('textarea').fill('Tea\nCoffee\n\nTea');
  await app.inspectorField('Hint text').locator('input').fill('Pick a drink');
  await expect(dropdown.locator('option')).toHaveText(['Pick a drink', 'Tea', 'Coffee']);
  await app.inspectorField('Starting choice').locator('input').fill('Coffee');
  await expect(dropdown).toHaveValue('Coffee');

  // Clicking the dropdown on the canvas selects it, instead of opening it.
  await app.select('Dropdown 1');
  await app.rootElement.click({ position: { x: 5, y: 5 } });
  await expect(app.inspector).toContainText('Screen background');
  await dropdown.click({ force: true }); // it's disabled in the designer, so click where it is
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Dropdown 1');
});

test('picking a choice runs “When value changes”, and blocks can read and set it', async ({ appNoBoot: app, seed }) => {
  const b = build('Drinks');
  const drink = b.element('dropdown', 'Drink', { options: 'Tea\nCoffee\nJuice', placeholder: 'Pick a drink' });
  const out = b.element('text', 'Out', { text: 'Nothing yet' });
  const reset = b.element('button', 'Reset', { label: 'Reset' });
  const changed = b.node('event.inputChange', { element: drink.id });
  const show = b.node('action.setText', { element: out.id });
  const join = b.node('data.join', { a: 'You picked ' });
  b.exec(changed, 'next', show);
  b.data(changed, 'value', join, 'b');
  b.data(join, 'value', show, 'text');
  // Reset puts the dropdown back on Tea and shows what it reads.
  const click = b.node('event.click', { element: reset.id });
  const set = b.node('action.setInputValue', { element: drink.id, value: 'Tea' });
  const read = b.node('data.getInputValue', { element: drink.id });
  const show2 = b.node('action.setText', { element: out.id });
  b.exec(click, 'next', set);
  b.exec(set, 'next', show2);
  b.data(read, 'value', show2, 'text');
  await seed(b.project);
  await app.goto();

  await app.run();
  const dropdown = app.designCanvas.getByRole('combobox', { name: 'Drink' });
  await expect(dropdown).toBeEnabled();
  await expect(dropdown).toHaveValue('');
  await dropdown.selectOption('Coffee');
  await expect(app.designCanvas.locator('.el-text')).toHaveText('You picked Coffee');
  await app.designCanvas.getByRole('button', { name: 'Reset' }).click();
  await expect(dropdown).toHaveValue('Tea');
  await expect(app.designCanvas.locator('.el-text')).toHaveText('Tea');

  await app.stop();
  await expect(dropdown).toBeDisabled();
  await expect(dropdown).toHaveValue('');
});

test('a dropdown can show a list variable, such as a field of records', async ({ appNoBoot: app, seed }) => {
  const b = build('Cities');
  const people = b.variable('people', 'list', [
    { name: 'Ada', city: 'London' },
    { name: 'Bo', city: 'Rome' },
  ]);
  const city = b.element('dropdown', 'City', { optionField: 'city' });
  city.props.options = { kind: 'variable', variableId: people.id };
  const add = b.element('button', 'Add', { label: 'Add Paris' });
  const click = b.node('event.click', { element: add.id });
  const rec = b.node('data.makeRecord', { fields: [{ id: 'c', name: 'city' }], f_c: 'Paris' });
  const push = b.node('action.addToList', { variable: people.id });
  b.exec(click, 'next', push);
  b.data(rec, 'value', push, 'item');
  await seed(b.project);
  await app.goto();

  const dropdown = app.designCanvas.getByRole('combobox', { name: 'City' });
  await expect(dropdown.locator('option')).toHaveText(['Choose…', 'London', 'Rome']);
  await app.select('City');
  await expect(app.inspectorField('Choices').getByLabel('Choices: linked to')).toHaveValue(people.id);

  // The choices follow the variable while the app runs.
  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Add Paris' }).click();
  await expect(dropdown.locator('option')).toHaveText(['Choose…', 'London', 'Rome', 'Paris']);
});
