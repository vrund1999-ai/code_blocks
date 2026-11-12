import { expect, test } from './support/fixtures';
import { build } from './support/projects';

/** Title, then a Box holding a List whose card shows a Name and a Delete button. */
function project() {
  const b = build('Layers');
  b.element('text', 'Title', { text: 'People' });
  const box = b.element('container', 'Box');
  const list = b.element('list', 'People List', {}, box);
  b.element('text', 'Name', { text: 'A name' }, list);
  b.element('button', 'Remove', { label: 'Remove' }, list);
  return b.project;
}

const rowNames = (tree: import('@playwright/test').Locator) =>
  tree.getByRole('treeitem').evaluateAll((rows) => rows.map((r) => r.getAttribute('aria-label')));

test('the layers panel outlines the screen and selects nested elements', async ({ appNoBoot: app, seed }) => {
  await seed(project());
  await app.goto();
  const tree = app.page.getByRole('tree', { name: 'Layers' });
  await expect.poll(() => rowNames(tree)).toEqual(['Home (screen)', 'Title', 'Box', 'People List', 'Name', 'Remove']);
  await expect(tree.getByRole('treeitem', { name: 'Name' })).toHaveAttribute('aria-level', '4');
  await expect(tree.getByRole('treeitem', { name: 'People List' })).toContainText('card for each item');

  // Clicking a row selects the element, even inside a List's card.
  await tree.getByRole('treeitem', { name: 'Remove' }).click();
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Remove');
  await expect(app.element('Remove')).toHaveClass(/selected/);
  await expect(tree.getByRole('treeitem', { name: 'Remove' })).toHaveAttribute('aria-selected', 'true');

  // Selecting on the canvas highlights the row.
  await app.select('Title');
  await expect(tree.getByRole('treeitem', { name: 'Title' })).toHaveAttribute('aria-selected', 'true');
  await expect(tree.getByRole('treeitem', { name: 'Remove' })).toHaveAttribute('aria-selected', 'false');

  // Pointing at a row outlines its element on the canvas.
  await tree.getByRole('treeitem', { name: 'Box' }).hover();
  await expect(app.element('Box')).toHaveClass(/layer-hover/);
  await app.designCanvas.hover({ position: { x: 5, y: 5 } });
  await expect(app.element('Box')).not.toHaveClass(/layer-hover/);
});

test('rows open and close, and selecting a hidden element opens them again', async ({ appNoBoot: app, seed }) => {
  await seed(project());
  await app.goto();
  const tree = app.page.getByRole('tree', { name: 'Layers' });
  const box = tree.getByRole('treeitem', { name: 'Box' });
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  await box.locator('.layer-toggle').click();
  await expect(box).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => rowNames(tree)).toEqual(['Home (screen)', 'Title', 'Box']);
  // Closing a row doesn't select it.
  await expect(box).toHaveAttribute('aria-selected', 'false');

  await app.select('Name');
  await expect.poll(() => rowNames(tree)).toEqual(['Home (screen)', 'Title', 'Box', 'People List', 'Name', 'Remove']);
  await expect(tree.getByRole('treeitem', { name: 'Name' })).toHaveAttribute('aria-selected', 'true');
});

test('arrow keys move through the layers, and Delete removes an element', async ({ appNoBoot: app, seed, page }) => {
  await seed(project());
  await app.goto();
  const tree = app.page.getByRole('tree', { name: 'Layers' });
  await tree.getByRole('treeitem', { name: 'Title' }).click();

  await page.keyboard.press('ArrowDown');
  await expect(tree.getByRole('treeitem', { name: 'Box' })).toBeFocused();
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Box');
  await page.keyboard.press('ArrowLeft'); // closes Box
  await expect(tree.getByRole('treeitem', { name: 'Box' })).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowRight'); // opens it
  await page.keyboard.press('ArrowRight'); // goes into it
  await expect(tree.getByRole('treeitem', { name: 'People List' })).toBeFocused();
  await page.keyboard.press('ArrowLeft'); // People List is open: closes it
  await page.keyboard.press('ArrowLeft'); // closed: goes up to Box
  await expect(tree.getByRole('treeitem', { name: 'Box' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(tree.getByRole('treeitem', { name: 'Title' })).toBeFocused();

  await page.keyboard.press('Delete');
  await expect.poll(() => rowNames(tree)).toEqual(['Home (screen)', 'Box', 'People List']);
  await expect(app.element('Title')).toHaveCount(0);
});

test('double-click a row to rename its element; Escape cancels', async ({ appNoBoot: app, seed }) => {
  await seed(project());
  await app.goto();
  const tree = app.page.getByRole('tree', { name: 'Layers' });
  await tree.getByRole('treeitem', { name: 'Title' }).dblclick();
  const input = tree.getByLabel('Element name');
  await expect(input).toBeFocused();
  await input.fill('Heading');
  await input.press('Enter');
  await expect(tree.getByRole('treeitem', { name: 'Heading' })).toBeVisible();
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Heading');

  await tree.getByRole('treeitem', { name: 'Heading' }).dblclick();
  await tree.getByLabel('Element name').fill('Oops');
  await tree.getByLabel('Element name').press('Escape');
  await expect(tree.getByLabel('Element name')).toHaveCount(0);
  await expect(tree.getByRole('treeitem', { name: 'Heading' })).toBeVisible();
  // Escape only cancels the rename; the element stays selected.
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Heading');

  // One undo step for the rename.
  await app.undoButton.click();
  await expect(tree.getByRole('treeitem', { name: 'Title' })).toBeVisible();
});

test('the layers follow the open screen', async ({ app }) => {
  const tree = app.page.getByRole('tree', { name: 'Layers' });
  await expect.poll(() => rowNames(tree)).toEqual(['Home (screen)', 'Title', 'Name Box', 'Say Hello', 'Greeting']);
  await app.screensPanel.getByRole('button', { name: '+ Add screen' }).click();
  await expect.poll(() => rowNames(tree)).toEqual(['Screen (screen)']);
  await tree.getByRole('treeitem', { name: 'Screen (screen)' }).click();
  await expect(app.inspector).toContainText('Screen background');
});
