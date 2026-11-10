import { expect, test } from './support/fixtures';

test.beforeEach(async ({ app }) => {
  await app.tab('Logic');
});

test('shows the Hello Name graph with a minimap', async ({ app, page }) => {
  await expect(app.blocks).toHaveCount(4);
  await expect(app.edges).toHaveCount(3);
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await expect(app.block('event.click')).toContainText('Say Hello');
});

test('palette search filters blocks', async ({ app, page }) => {
  await app.blockSearch.fill('message');
  await expect(app.paletteBlock('Show message')).toBeVisible();
  await expect(app.paletteBlock('Set text')).toBeHidden();
  await app.blockSearch.fill('zzz-nothing');
  await expect(page.locator('.node-item')).toHaveCount(0);
  await app.blockSearch.fill('');
  await expect(app.paletteBlock('Set text')).toBeVisible();
});

test('adds a block by clicking it in the palette', async ({ app }) => {
  await app.addBlock('Show message');
  await expect(app.block('action.toast')).toBeVisible();
});

test('adds a block by dragging it onto the canvas', async ({ app, page, browserName }) => {
  test.fixme(browserName === 'webkit', 'QE-11: HTML5 drag-and-drop is not simulated in WebKit');
  const pane = page.locator('.logic-canvas .react-flow__pane');
  const b = (await pane.boundingBox())!;
  await app.paletteBlock('Wait').dragTo(pane, { targetPosition: { x: b.width / 2, y: b.height - 120 } });
  await expect(app.blocks).toHaveCount(5);
  await expect(app.block('action.wait')).toBeVisible();
});

test('selecting a block shows its settings in the inspector', async ({ app }) => {
  await app.block('data.join').locator('.block-header').click();
  await expect(app.inspector.locator('.title')).toHaveText('Join text');
  await expect(app.inspector).toContainText('Or connect a value block');
});

test('wires a new action after Set text and runs it', async ({ app }) => {
  await app.addBlock('Show message');
  const toast = app.block('action.toast');
  await app.moveBlock(toast, 0, 220);
  await app.connect(app.block('action.setText'), 'next', toast, 'in');
  await expect(app.edges).toHaveCount(4);

  await app.run();
  await app.logicPreview.locator('input.el-input').fill('Cy');
  await app.logicPreview.locator('button.el-button').click();
  await expect(app.toasts(app.logicPreview).first()).toHaveText('Hello!');
});

test('rejects a wire from an exec pin into a data pin', async ({ app, browserName }) => {
  test.fixme(browserName === 'firefox', 'QE-11: this pointer drag hangs in Firefox automation');
  await app.connect(app.block('event.click'), 'next', app.block('data.join'), 'a');
  await expect(app.edges).toHaveCount(3);
});

test('rejects a wire between incompatible value types', async ({ app }) => {
  await app.addBlock('Count items');
  const count = app.block('data.listLength');
  await app.moveBlock(count, 0, 240);
  // Text (Join's result) cannot go into a List input.
  await app.connect(app.block('data.join'), 'value', count, 'list');
  await expect(app.edges).toHaveCount(3);
});

test('a second wire into the same input replaces the first', async ({ app }) => {
  await app.connect(app.block('data.getInputValue'), 'value', app.block('action.setText'), 'text');
  await expect(app.edges).toHaveCount(3);

  await app.run();
  await app.logicPreview.locator('input.el-input').fill('Ada');
  await app.logicPreview.locator('button.el-button').click();
  await expect(app.logicPreview.locator('.el-text').nth(1)).toHaveText('Ada');
});

test('inline values on a block change the result', async ({ app }) => {
  const first = app.block('data.join').locator('.pin-row.in', { hasText: 'First' }).locator('input');
  await expect(first).toHaveValue('Hello, ');
  await first.fill('Hi, ');

  await app.run();
  await app.logicPreview.locator('input.el-input').fill('Ada');
  await app.logicPreview.locator('button.el-button').click();
  await expect(app.logicPreview.locator('.el-text').nth(1)).toHaveText('Hi, Ada');
});

test('the Delete key removes a block and its wires', async ({ app, page }) => {
  await app.block('data.join').locator('.block-header').click();
  await page.keyboard.press('Delete');
  await expect(app.blocks).toHaveCount(3);
  await expect(app.edges).toHaveCount(1);
});

test('the inspector Delete block button removes a block', async ({ app }) => {
  await app.block('action.setText').locator('.block-header').click();
  await app.inspector.getByRole('button', { name: 'Delete block' }).click();
  await expect(app.blocks).toHaveCount(3);
  await expect(app.edges).toHaveCount(1);
});

test('block pickers name elements, not ids', async ({ app }) => {
  const picker = app.block('action.setText').locator('select').first();
  await expect(picker.locator('option:checked')).toContainText('Greeting');
});
