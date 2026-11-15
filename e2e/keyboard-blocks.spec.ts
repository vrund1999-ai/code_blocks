import type { Locator } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { build } from './support/projects';

/** A button with a click block, and a toast block not wired to anything. */
function clickApp() {
  const b = build('Keyboard');
  const add = b.element('button', 'Add point', { label: 'Add point' });
  b.node('event.click', { element: add.id });
  b.node('action.toast', { message: 'Point!' });
  return b.project;
}

/** Picks a block from the keyboard: Tab to it (here, focus it), then Enter. */
async function pickBlock(block: Locator) {
  await block.focus();
  await block.press('Enter');
  await expect(block.locator('.block')).toHaveClass(/selected/);
}

const position = (block: Locator) =>
  block.evaluate((el) => {
    const m = /translate\(([-\d.]+)px, ?([-\d.]+)px\)/.exec((el as HTMLElement).style.transform);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  });

test('a block’s Wires list connects and disconnects it without a mouse', async ({ appNoBoot: app, seed }) => {
  await seed(clickApp());
  await app.goto();
  await app.tab('Logic');
  await expect(app.edges).toHaveCount(0);

  await pickBlock(app.block('action.toast'));
  const wires = app.inspector.getByRole('region', { name: 'Wires' });
  const comesFrom = wires.getByRole('group', { name: 'Comes from' });
  await comesFrom.getByLabel('New wire for “Comes from”').selectOption({ label: 'When “Add point” is clicked: Then' });
  await expect(app.edges).toHaveCount(1);
  await expect(comesFrom.locator('.wire-end')).toHaveText(['When “Add point” is clicked: Then']);
  // It is the same wire as one drawn with the pointer: clicking the button shows the message.
  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Add point' }).click();
  await expect(app.toasts(app.logicPreview)).toHaveText(['Point!']);
  await app.stop();

  await comesFrom.getByRole('button', { name: 'Disconnect from When “Add point” is clicked: Then' }).click();
  await expect(app.edges).toHaveCount(0);
  await expect(comesFrom.locator('.wire-end')).toHaveCount(0);
  await app.undoButton.click();
  await expect(app.edges).toHaveCount(1);
});

test('arrow keys move a selected block, as one undo step, and the move is saved', async ({ appNoBoot: app, seed }) => {
  await seed(clickApp());
  await app.goto();
  await app.tab('Logic');
  const toast = app.block('action.toast');
  await pickBlock(toast);
  const start = await position(toast);
  expect(start).not.toBeNull();

  // With Shift, each press moves 20 pixels.
  await toast.press('Shift+ArrowRight');
  await toast.press('Shift+ArrowRight');
  await toast.press('Shift+ArrowDown');
  await expect.poll(() => position(toast)).toEqual({ x: start!.x + 40, y: start!.y + 20 });

  await app.undoButton.click();
  await expect.poll(() => position(toast)).toEqual(start);
  await app.redoButton.click();
  await expect.poll(() => position(toast)).toEqual({ x: start!.x + 40, y: start!.y + 20 });

  await app.waitForSave();
  await app.reload();
  await app.tab('Logic');
  await expect.poll(() => position(app.block('action.toast'))).toEqual({ x: start!.x + 40, y: start!.y + 20 });
});

test('Alt+arrow keys in Layers move the selected element', async ({ appNoBoot: app, seed, page }) => {
  const b = build('Layers');
  b.element('text', 'Title', { text: 'Hi' });
  const box = b.element('container', 'Box');
  b.element('text', 'Inner', { text: 'Inside' }, box);
  b.element('button', 'Save', { label: 'Save' });
  await seed(b.project);
  await app.goto();
  const url = page.url();
  const tree = page.getByRole('tree', { name: 'Layers' });
  const rows = () =>
    tree
      .getByRole('treeitem')
      .evaluateAll((els) => els.map((r) => `${r.getAttribute('aria-level')} ${r.querySelector('.layer-name')?.textContent}`));

  await tree.getByRole('treeitem', { name: 'Save' }).click();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(rows).toEqual(['1 Home', '2 Title', '2 Save', '2 Box', '3 Inner']);
  await expect(tree.getByRole('treeitem', { name: 'Save' })).toBeFocused();
  expect(await app.topLevelNames()).toEqual(['Title', 'Save', 'Box']);

  await page.keyboard.press('Alt+ArrowDown');
  // Into the box above it, at its end; then back out, just after the box.
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(rows).toEqual(['1 Home', '2 Title', '2 Box', '3 Inner', '3 Save']);
  await expect(tree.getByRole('treeitem', { name: 'Save' })).toBeFocused();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(rows).toEqual(['1 Home', '2 Title', '2 Box', '3 Inner', '2 Save']);
  // Alt+Left didn't go back a page.
  expect(page.url()).toBe(url);

  // Each move is one undo step.
  await app.undoButton.click();
  await expect.poll(rows).toEqual(['1 Home', '2 Title', '2 Box', '3 Inner', '3 Save']);

  // At the top, Alt+Up does nothing.
  await tree.getByRole('treeitem', { name: 'Title' }).click();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(rows).toEqual(['1 Home', '2 Title', '2 Box', '3 Inner', '3 Save']);
});
