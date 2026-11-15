import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('add a number box and a slider and change their settings', async ({ appNoBoot: app, seed }) => {
  await seed(build('Empty').project);
  await app.goto();

  await app.paletteItem('Number Box').click();
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Number Box 1');
  const box = app.designCanvas.getByRole('spinbutton', { name: 'Number Box 1' });
  await expect(box).toHaveValue('');
  await app.inspectorField('Starting value').locator('input').fill('-4');
  await expect(box).toHaveValue('-4');
  await app.inspectorField('Smallest').locator('input').fill('-10');
  await expect(box).toHaveAttribute('min', '-10');

  await app.paletteItem('Slider').click();
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Slider 1');
  const slider = app.designCanvas.getByRole('slider', { name: 'Slider 1' });
  await expect(slider).toHaveValue('50');
  await expect(app.designCanvas.locator('.slider-value')).toHaveText('50');
  await app.inspectorField('Biggest').locator('input').fill('10');
  // The starting value is kept within the new ends.
  await expect(slider).toHaveValue('10');
  await expect(app.designCanvas.locator('.slider-value')).toHaveText('10');
  await app.inspectorField('Show the number').locator('input').uncheck();
  await expect(app.designCanvas.locator('.slider-value')).toHaveCount(0);

  // Clicking the slider on the canvas selects it, instead of moving it.
  await app.rootElement.click({ position: { x: 5, y: 5 } });
  await expect(app.inspector).toContainText('Screen background');
  await slider.click({ force: true }); // it's disabled in the designer, so click where it is
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Slider 1');
});

test('blocks read, set and react to number boxes and sliders', async ({ appNoBoot: app, seed }) => {
  const b = build('Order');
  const qty = b.element('number', 'Quantity', { min: 0, max: 10, value: '' });
  const total = b.element('text', 'Total', { text: '' });
  const volume = b.element('slider', 'Volume', { min: 0, max: 100, step: 5, value: 50 });
  const level = b.element('text', 'Level', { text: '' });
  const reset = b.element('button', 'Reset', { label: 'Reset' });

  // Total = quantity × 2, each time the quantity changes.
  const typed = b.node('event.inputChange', { element: qty.id });
  const read = b.node('data.getInputValue', { element: qty.id });
  const times = b.node('data.math', { op: '*', b: 2 });
  const setTotal = b.node('action.setText', { element: total.id });
  b.exec(typed, 'next', setTotal);
  b.data(read, 'value', times, 'a');
  b.data(times, 'value', setTotal, 'text');
  // The level shows the slider's new value.
  const slid = b.node('event.inputChange', { element: volume.id });
  const setLevel = b.node('action.setText', { element: level.id });
  b.exec(slid, 'next', setLevel);
  b.data(slid, 'value', setLevel, 'text');
  // Reset sets both, past their ends and off the slider's steps.
  const click = b.node('event.click', { element: reset.id });
  const setQty = b.node('action.setInputValue', { element: qty.id, value: '99' });
  const setVolume = b.node('action.setInputValue', { element: volume.id, value: '22' });
  b.exec(click, 'next', setQty);
  b.exec(setQty, 'next', setVolume);
  await seed(b.project);
  await app.goto();
  await app.run();

  const canvas = app.designCanvas;
  const qtyBox = canvas.getByRole('spinbutton', { name: 'Quantity' });
  const slider = canvas.getByRole('slider', { name: 'Volume' });
  const text = (name: string) => canvas.locator('.el-text').nth(name === 'Total' ? 0 : 1);

  await qtyBox.fill('3');
  await expect(text('Total')).toHaveText('6');
  // Past the biggest number: blocks read 10, and leaving the box shows it.
  await qtyBox.fill('15');
  await expect(text('Total')).toHaveText('20');
  await expect(qtyBox).toHaveValue('15');
  await slider.focus();
  await expect(qtyBox).toHaveValue('10');

  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('55');
  await expect(text('Level')).toHaveText('55');
  await expect(canvas.locator('.slider-value')).toHaveText('55');

  await canvas.getByRole('button', { name: 'Reset' }).click();
  await expect(qtyBox).toHaveValue('10');
  await expect(slider).toHaveValue('20');
  await expect(canvas.locator('.slider-value')).toHaveText('20');

  await app.stop();
  await expect(slider).toHaveValue('50');
  await expect(qtyBox).toHaveValue('');
});
