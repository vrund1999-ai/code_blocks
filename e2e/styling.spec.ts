import { expect, test } from './support/fixtures';
import { build } from './support/projects';

const css = (loc: import('@playwright/test').Locator, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('give a button a size, rounded corners, a shadow and a font', async ({ appNoBoot: app, seed }) => {
  const b = build('Styled');
  b.element('button', 'Go', { label: 'Go' });
  await seed(b.project);
  await app.goto();
  await app.select('Go');
  const style = app.inspector.getByRole('region', { name: 'Style' });
  await expect(style).toBeVisible();

  await style.getByLabel('Width').fill('150');
  await style.getByLabel('Height').fill('50');
  await style.getByLabel('Space around').fill('10');
  await style.getByLabel('Rounded corners').fill('20');
  await app.inspectorField('Shadow').locator('select').selectOption({ label: 'Strong' });
  await app.inspectorField('Font').locator('select').selectOption({ label: 'Classic (serif)' });

  const button = app.designCanvas.getByRole('button', { name: 'Go', exact: true });
  const check = async () => {
    await expect(button).toHaveCSS('width', '150px');
    await expect(button).toHaveCSS('height', '50px');
    await expect(button).toHaveCSS('margin-top', '10px');
    await expect(button).toHaveCSS('border-radius', '20px');
    await expect.poll(() => css(button, 'box-shadow')).not.toBe('none');
    await expect.poll(() => css(button, 'font-family')).toContain('Georgia');
  };
  await check();
  // The running app looks the same.
  await app.run();
  await check();
  await app.stop();

  // Emptying a size puts it back to automatic; undo brings it back.
  await style.getByLabel('Width').fill('');
  await expect.poll(async () => (await button.boundingBox())!.width).toBeGreaterThan(200);
  await app.undoButton.click();
  await expect(button).toHaveCSS('width', '150px');
});

test('a text box with a width set stays that wide in a row', async ({ appNoBoot: app, seed }) => {
  const b = build('Row');
  const row = b.element('container', 'Row', { direction: 'row' });
  b.element('input', 'Code', { placeholder: 'Code', width: 90 }, row);
  b.element('input', 'Name', { placeholder: 'Name' }, row);
  await seed(b.project);
  await app.goto();

  const code = app.designCanvas.getByPlaceholder('Code');
  const name = app.designCanvas.getByPlaceholder('Name');
  const widths = async () => [(await code.boundingBox())!.width, (await name.boundingBox())!.width];
  await expect.poll(widths).toEqual([90, expect.any(Number)]);
  expect((await widths())[1]).toBeGreaterThan(150);
  // The selection outline hugs the element instead of filling the row.
  await app.select('Code');
  await expect.poll(async () => (await app.element('Code').boundingBox())!.width).toBeLessThan(100);

  await app.run();
  await expect.poll(widths).toEqual([90, expect.any(Number)]);
  expect((await widths())[1]).toBeGreaterThan(150);
});

test('the screen’s font is used by everything on it', async ({ appNoBoot: app, seed }) => {
  const b = build('Fonts');
  b.element('text', 'Title', { text: 'Hello' });
  b.element('button', 'Go', { label: 'Go' });
  b.element('text', 'Code', { text: 'x = 1', font: 'mono' });
  await seed(b.project);
  await app.goto();

  await app.rootElement.click({ position: { x: 5, y: 5 } });
  await expect(app.inspector).toContainText('Screen background');
  // The screen only offers a font: its size comes from the device.
  await expect(app.inspectorField('Width')).toHaveCount(0);
  await expect(app.inspectorField('Shadow')).toHaveCount(0);
  await app.inspectorField('Font').locator('select').selectOption({ label: 'Handwriting' });

  const font = (name: string) => css(app.designCanvas.getByText(name, { exact: true }), 'font-family');
  await expect.poll(() => font('Hello')).toContain('Segoe Print');
  await expect.poll(() => font('Go')).toContain('Segoe Print');
  // An element's own font wins.
  await expect.poll(() => font('x = 1')).toContain('monospace');
});
