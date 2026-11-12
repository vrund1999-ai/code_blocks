import { expect, test } from './support/fixtures';
import { build } from './support/projects';

/** A button with a click block on the left and a "Set text" block far to the right. */
function project() {
  const b = build('Wires');
  const button = b.element('button', 'Go', { label: 'Go' });
  const out = b.element('text', 'Out', { text: 'Waiting' });
  b.node('event.click', { element: button.id }, { x: 40, y: 40 });
  b.node('action.setText', { element: out.id }, { x: 800, y: 300 });
  return b.project;
}

test('a wire dropped on empty space after a step suggests what happens next', async ({ appNoBoot: app, seed }) => {
  await seed(project());
  await app.goto();
  await app.tab('Logic');

  await app.dragWireToEmpty(app.block('event.click'), 'next', 'source', 200, 40);
  const menu = app.suggestMenu;
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Add a block: what happens next');
  await expect(menu.getByRole('button', { name: 'Show message' })).toBeVisible();
  // Events start a chain, so they can't come after a step.
  await expect(menu.getByRole('button', { name: 'When button clicked' })).toHaveCount(0);
  await expect(menu.getByLabel('Search blocks that fit')).toBeFocused();

  // Search, then Enter adds the first match, wired to the click block.
  await menu.getByLabel('Search blocks that fit').fill('message');
  await expect(menu.locator('.suggest-item')).toHaveText(['Show message']);
  await menu.getByLabel('Search blocks that fit').press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(app.blocksOfType('action.toast')).toHaveCount(1);
  await expect(app.edges).toHaveCount(1);
  await expect(app.block('action.toast')).toHaveClass(/selected/);

  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Go' }).click();
  await expect(app.toasts().last()).toHaveText('Hello!');
});

test('a wire dragged back from an input suggests where its value can come from', async ({ appNoBoot: app, seed }) => {
  await seed(project());
  await app.goto();
  await app.tab('Logic');

  const set = app.block('action.setText');
  await app.dragWireToEmpty(set, 'text', 'target', -220, 60);
  const menu = app.suggestMenu;
  await expect(menu).toContainText('where “Text” comes from');
  await expect(menu.getByRole('group', { name: 'Text' }).getByRole('button', { name: /^Join text/ })).toBeVisible();
  // Steps have no value outputs.
  await expect(menu.getByRole('button', { name: 'Show message' })).toHaveCount(0);

  await menu.getByRole('button', { name: /^Join text/ }).click();
  await expect(app.edges).toHaveCount(1);
  const join = app.block('data.join');
  await join.locator('.pin-row.in').nth(0).locator('input').fill('Hi ');
  await join.locator('.pin-row.in').nth(1).locator('input').fill('there');
  // The text input of "Set text" is wired now, so it has no typed-in value.
  await expect(set.locator('.pin-row.in input')).toHaveCount(0);

  await app.connect(app.block('event.click'), 'next', set, 'in');
  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Go' }).click();
  await expect(app.logicPreview.locator('.el-text')).toHaveText('Hi there');
});

test('the menu closes with Escape or a click elsewhere, and undo removes block and wire together', async ({
  appNoBoot: app,
  seed,
}) => {
  await seed(project());
  await app.goto();
  await app.tab('Logic');
  const click = app.block('event.click');

  await app.dragWireToEmpty(click, 'next', 'source', 200, 40);
  await expect(app.suggestMenu).toBeVisible();
  await app.page.keyboard.press('Escape');
  await expect(app.suggestMenu).toHaveCount(0);

  await app.dragWireToEmpty(click, 'next', 'source', 200, 40);
  await expect(app.suggestMenu).toBeVisible();
  await app.page.locator('.react-flow__pane').click({ position: { x: 20, y: 600 } });
  await expect(app.suggestMenu).toHaveCount(0);
  await expect(app.blocks).toHaveCount(2);

  await app.dragWireToEmpty(click, 'next', 'source', 200, 40);
  await app.suggestMenu.getByRole('button', { name: 'Wait' }).click();
  await expect(app.blocks).toHaveCount(3);
  await expect(app.edges).toHaveCount(1);
  await app.undoButton.click();
  await expect(app.blocks).toHaveCount(2);
  await expect(app.edges).toHaveCount(0);
});

test('dropping a wire on a block does not open the menu', async ({ appNoBoot: app, seed }) => {
  await seed(project());
  await app.goto();
  await app.tab('Logic');
  // Let go over the middle of the other block, away from its pins.
  const body = await app.block('action.setText').locator('.block-sentence').boundingBox();
  const from = await app.handle(app.block('event.click'), 'next', 'source').boundingBox();
  await app.page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await app.page.mouse.down();
  await app.page.mouse.move(body!.x + body!.width / 2, body!.y + body!.height / 2, { steps: 15 });
  await app.page.mouse.up();
  await expect(app.blocks).toHaveCount(2);
  await expect(app.suggestMenu).toHaveCount(0);
});
