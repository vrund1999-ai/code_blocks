import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('key presses run blocks while the app runs, but not keys typed in a text box', async ({ appNoBoot: app, seed, page }) => {
  const b = build('Keys');
  b.element('input', 'Name box');
  const up = b.node('event.keyPress', { key: 'ArrowUp' });
  b.exec(up, 'next', b.node('action.toast', { message: 'Up!' }));
  const any = b.node('event.keyPress', { key: 'any' });
  const say = b.node('action.toast');
  b.exec(any, 'next', say);
  b.data(any, 'key', say, 'message');
  await seed(b.project);
  // Toasts go after 3 seconds; with the clock stopped, they stay for the test.
  await page.clock.install();
  await app.goto();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));

  // Not while designing.
  await page.keyboard.press('ArrowUp');
  await app.run();
  // Straight after pressing Run, keys go to the app.
  await page.keyboard.press('ArrowUp');
  await expect(app.toasts()).toHaveText(['Up!', 'ArrowUp']);

  // Letters count with or without Shift; shortcuts don't count.
  await page.keyboard.press('Shift+W');
  await page.keyboard.press('Control+b');
  await expect(app.toasts()).toHaveText(['Up!', 'ArrowUp', 'w']);

  // Typing in a text box only counts Enter.
  const box = app.designCanvas.locator('input.el-input');
  await box.fill('');
  await box.pressSequentially('hi');
  await box.press('Enter');
  await expect(box).toHaveValue('hi');
  await expect(app.toasts()).toHaveText(['Up!', 'ArrowUp', 'w', 'Enter']);

  // Not in the editor's own panels, and not after Stop.
  await app.stop();
  await page.keyboard.press('ArrowUp');
  await expect(app.toasts()).toHaveCount(0);
});

test('clicking a list item runs its block with the item, but its buttons run their own', async ({ appNoBoot: app, seed }) => {
  const b = build('Clicks');
  const people = b.variable('people', 'list', [{ name: 'Ada' }, { name: 'Bo' }]);
  const list = b.element('list', 'People List');
  list.props.items = { kind: 'variable', variableId: people.id };
  const name = b.element('text', 'Name', {}, list);
  name.props.text = { kind: 'item', field: 'name' };
  const hi = b.element('button', 'Say hi', { label: 'Say hi' }, list);
  const click = b.node('event.cardClick', { element: list.id });
  const field = b.node('data.getField', { field: 'name' });
  const say = b.node('action.toast');
  b.exec(click, 'next', say);
  b.data(click, 'item', field, 'record');
  b.data(field, 'value', say, 'message');
  b.exec(b.node('event.click', { element: hi.id }), 'next', b.node('action.toast', { message: 'Hi!' }));
  await seed(b.project);
  await app.goto();
  await app.run();

  const rows = app.designCanvas.locator('.list-row.clickable');
  await expect(rows).toHaveCount(2);
  await rows.nth(1).locator('.el-text').click();
  await expect(app.toasts()).toHaveText(['Bo']);
  await rows.nth(0).getByRole('button', { name: 'Say hi' }).click();
  await expect(app.toasts()).toHaveText(['Bo', 'Hi!']);

  // And from the keyboard.
  await rows.nth(0).focus();
  await rows.nth(0).press('Enter');
  await expect(app.toasts()).toHaveText(['Bo', 'Hi!', 'Ada']);
});

test('moving the mouse onto and off an element runs its blocks', async ({ appNoBoot: app, seed, page }) => {
  const b = build('Hover');
  const help = b.element('text', 'Help', { text: 'Hover me' });
  const tip = b.element('text', 'Tip', { text: 'A helpful tip', visible: false });
  b.exec(b.node('event.hover', { element: help.id, action: 'enter' }), 'next', b.node('action.setVisible', { element: tip.id, visible: true }));
  b.exec(b.node('event.hover', { element: help.id, action: 'leave' }), 'next', b.node('action.setVisible', { element: tip.id, visible: false }));
  await seed(b.project);
  await app.goto();
  await app.run();

  const tipText = app.designCanvas.getByText('A helpful tip');
  await expect(tipText).toBeHidden();
  await app.designCanvas.getByText('Hover me').hover();
  await expect(tipText).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tipText).toBeHidden();
});
