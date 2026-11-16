import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('add a date picker and change its settings', async ({ appNoBoot: app, seed, page }) => {
  // Sunday 15 November 2026, on the browser's clock.
  await page.clock.setFixedTime(new Date(2026, 10, 15, 14, 30));
  await seed(build('Empty').project);
  await app.goto();

  await app.paletteItem('Date Picker').click();
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Date Picker 1');
  const picker = app.designCanvas.locator('input.el-date');
  await expect(picker).toHaveAccessibleName('Date Picker 1');
  await expect(picker).toHaveAttribute('type', 'date');
  await expect(picker).toHaveValue('');
  await expect(app.inspectorField('Starting date').locator('input')).toHaveAttribute('placeholder', 'Nothing picked');

  await app.inspectorField('Starting date').locator('input').fill('today');
  await expect(picker).toHaveValue('2026-11-15');
  await app.inspectorField('Earliest').locator('input').fill('today');
  await expect(picker).toHaveAttribute('min', '2026-11-15');

  await app.inspectorField('Pick a time too').locator('input').check();
  await expect(picker).toHaveAttribute('type', 'datetime-local');
  await expect(picker).toHaveValue('2026-11-15T00:00');
});

test('blocks read, set and react to a date picker', async ({ appNoBoot: app, seed, page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 15, 14, 30));
  const b = build('Booking');
  const arrival = b.element('date', 'Arrival', { min: 'today' });
  const away = b.element('text', 'Away', { text: '' });
  const reset = b.element('button', 'Next week', { label: 'Next week' });
  // When a date is picked: show how many days away it is.
  const picked = b.node('event.inputChange', { element: arrival.id });
  const days = b.node('date.between', { unit: 'days' });
  const show = b.node('action.setText', { element: away.id });
  b.exec(picked, 'next', show);
  b.data(picked, 'value', days, 'to');
  b.data(days, 'value', show, 'text');
  // Next week: a week from today, from the date blocks.
  const click = b.node('event.click', { element: reset.id });
  const week = b.node('date.add', { amount: 7, unit: 'days' });
  const set = b.node('action.setInputValue', { element: arrival.id });
  b.exec(click, 'next', set);
  b.data(week, 'value', set, 'value');
  await seed(b.project);
  await app.goto();

  await app.run();
  const picker = app.designCanvas.locator('input.el-date');
  await expect(picker).toHaveValue('');
  await picker.fill('2026-12-25');
  await expect(app.designCanvas.locator('.el-text')).toHaveText('40');

  await app.designCanvas.getByRole('button', { name: 'Next week' }).click();
  await expect(picker).toHaveValue('2026-11-22');

  // Picking a day before the earliest one counts as the earliest.
  await picker.fill('2026-11-01');
  await expect(picker).toHaveValue('2026-11-15');
  await expect(app.designCanvas.locator('.el-text')).toHaveText('0');
});
