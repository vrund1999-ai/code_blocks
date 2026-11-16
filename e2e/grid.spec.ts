import type { Locator } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { build } from './support/projects';

const box = async (l: Locator) => (await l.boundingBox())!;

/** A Box with four buttons, A to D. */
function fourButtons(props: Record<string, unknown> = {}) {
  const b = build('Grid');
  const grid = b.element('container', 'Tiles', props);
  for (const name of ['A', 'B', 'C', 'D']) b.element('button', name, { label: name }, grid);
  return b;
}

test('a Box can arrange its items in a grid of columns', async ({ appNoBoot: app, seed }) => {
  await seed(fourButtons().project);
  await app.goto();
  const button = (name: string) => app.designCanvas.locator('button.el-button', { hasText: name });

  await app.select('Tiles');
  // Columns only matter for a grid.
  await expect(app.inspectorField('Columns')).toHaveCount(0);
  await app.inspectorField('Arrange items').locator('select').selectOption({ label: 'In a grid' });
  await expect(app.inspectorField('Columns').locator('input')).toHaveAttribute('placeholder', '2');

  // Two columns: A B on the first row, C D on the second.
  await expect(async () => {
    const [a, b, c] = [await box(button('A')), await box(button('B')), await box(button('C'))];
    expect(Math.round(b.y)).toBe(Math.round(a.y));
    expect(b.x).toBeGreaterThan(a.x + a.width / 2);
    expect(c.y).toBeGreaterThan(a.y + a.height);
    expect(Math.round(c.x)).toBe(Math.round(a.x));
  }).toPass();

  // Four columns: all on one row, each a quarter of the Box.
  await app.inspectorField('Columns').locator('input').fill('4');
  await expect(async () => {
    const [a, d] = [await box(button('A')), await box(button('D'))];
    expect(Math.round(d.y)).toBe(Math.round(a.y));
    expect(d.x).toBeGreaterThan(a.x + 2 * a.width);
  }).toPass();

  // More than six counts as six.
  await app.inspectorField('Columns').locator('input').fill('9');
  await expect(app.element('Tiles').locator('.el-container.cb-grid').first()).toHaveCSS(
    'grid-template-columns',
    /^(\S+ ){5}\S+$/,
  );
});

test('dropping into a grid places the element where the pointer is', async ({ appNoBoot: app, seed, page, browserName }) => {
  test.fixme(browserName !== 'chromium', 'QE-11: drag tests only run in Chromium for now');
  await seed(fourButtons({ direction: 'grid', columns: 2 }).project);
  await app.goto();
  const tiles = app.element('Tiles');

  // Onto the right half of A: just after it, so between A and B.
  await expect(tiles.locator('.cb-grid')).toBeVisible();
  const source = await box(app.paletteItem('Text'));
  const a = await box(tiles.locator('button.el-button', { hasText: 'A' }));
  await page.mouse.move(source.x + 20, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + 40, { steps: 5 });
  await page.mouse.move(a.x + a.width - 10, a.y + a.height / 2, { steps: 15 });
  // The bar takes no cell, so nothing moves while dragging: it shows beside B instead.
  const bar = tiles.locator('.cb-grid > .drop-bar');
  await expect(bar).toHaveCount(1);
  await expect(bar.locator('xpath=following-sibling::*[1]')).toHaveText(/B/);
  expect((await box(tiles.locator('button.el-button', { hasText: 'A' }))).x).toBe(a.x);
  await page.mouse.up();

  await expect(tiles.locator('.el-container.cb-grid').first().locator(':scope > *')).toHaveText([/A$/, /Some text$/, /B$/, /C$/, /D$/]);
});

test('a List can show its cards side by side, like a gallery', async ({ appNoBoot: app, seed }) => {
  const b = build('Gallery');
  const fruit = b.variable('fruit', 'list', ['Apple', 'Banana', 'Cherry', 'Date', 'Elder']);
  const list = b.element('list', 'Fruit', { columns: 3 });
  list.props.items = { kind: 'variable', variableId: fruit.id };
  const name = b.element('text', 'Name', {}, list);
  name.props.text = { kind: 'item', field: '' };
  await seed(b.project);
  await app.goto();

  await app.select('Fruit');
  await expect(app.inspectorField('Cards per row').locator('input')).toHaveValue('3');

  await app.run();
  const cards = app.designCanvas.locator('.list-card .el-text');
  await expect(cards).toHaveText(['Apple', 'Banana', 'Cherry', 'Date', 'Elder']);
  const [apple, cherry, date] = [await box(cards.nth(0)), await box(cards.nth(2)), await box(cards.nth(3))];
  // Three on the first row, then the next row.
  expect(Math.round(cherry.y)).toBe(Math.round(apple.y));
  expect(cherry.x).toBeGreaterThan(apple.x);
  expect(date.y).toBeGreaterThan(apple.y);
  expect(Math.round(date.x)).toBe(Math.round(apple.x));
});
