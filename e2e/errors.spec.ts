import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('a block with nothing picked shows a friendly error', async ({ appNoBoot: app, seed }) => {
  const b = build('Broken App');
  const button = b.element('button', 'Go', { label: 'Go' });
  const click = b.node('event.click', { element: button.id });
  const set = b.node('action.setText', { text: 'hi' }); // no element picked
  b.exec(click, 'next', set);
  await seed(b.project);
  await app.goto();

  await app.run();
  await app.designCanvas.locator('button.el-button').click();
  await expect(app.errorPill).toBeVisible();
  await expect(app.toasts().first()).toContainText('Set text');

  // "show me" jumps to the broken block in the Logic tab.
  await app.errorPill.click();
  await expect(app.page.locator('.logic-canvas')).toBeVisible();
  await expect(app.page.locator('.block.has-error')).toHaveCount(1);
  await expect(app.block('action.setText').locator('.block')).toHaveClass(/has-error/);
  await expect(app.inspector.locator('.title')).toHaveText('Set text');

  await app.stop();
  await expect(app.errorPill).toBeHidden();
  await expect(app.page.locator('.block.has-error')).toHaveCount(0);
});

test('"show me" zooms the Logic tab to the broken block', async ({ appNoBoot: app, seed, page }) => {
  const b = build('Far Away');
  const button = b.element('button', 'Go', { label: 'Go' });
  const click = b.node('event.click', { element: button.id }, { x: 0, y: 0 });
  const set = b.node('action.setText', { text: 'hi' }, { x: 2000, y: 1500 }); // no element picked
  b.exec(click, 'next', set);
  await seed(b.project);
  await app.goto();

  // From the Design tab, so the Logic tab is shown (and maybe loaded) first.
  await app.run();
  await app.designCanvas.locator('button.el-button').click();
  await app.errorPill.click();
  const canvas = (await page.locator('.logic-canvas').boundingBox())!;
  const inView = async (type: string) => {
    const box = await app.block(type).boundingBox();
    return !!box && box.x >= canvas.x && box.y >= canvas.y && box.x + box.width <= canvas.x + canvas.width && box.y + box.height <= canvas.y + canvas.height;
  };
  await expect.poll(() => inView('action.setText')).toBe(true);
  // Zoomed in on it, so the block far from it is out of view.
  await expect.poll(() => inView('event.click')).toBe(false);

  // Again with the Logic tab already open, after showing the whole graph.
  await page.locator('.react-flow__controls-fitview').click();
  await expect.poll(() => inView('event.click')).toBe(true);
  await app.errorPill.click();
  await expect.poll(() => inView('event.click')).toBe(false);
  await expect.poll(() => inView('action.setText')).toBe(true);
});

test('an endless loop stops with a "too many steps" message', async ({ appNoBoot: app, seed, browserName }) => {
  test.fixme(browserName === 'firefox', 'QE-11: the click on a long-running handler never returns in Firefox automation');
  const b = build('Loop App');
  const count = b.variable('count', 'number', 0);
  const button = b.element('button', 'Go', { label: 'Go' });
  const click = b.node('event.click', { element: button.id });
  const repeat = b.node('flow.repeat', { times: 100000 });
  const inc = b.node('action.changeVariable', { variable: count.id, amount: 1 });
  b.exec(click, 'next', repeat);
  b.exec(repeat, 'body', inc);
  await seed(b.project);
  await app.goto();

  await app.run();
  await app.designCanvas.locator('button.el-button').click();
  await expect(app.errorPill).toBeVisible();
  await expect(app.errorPill).toHaveAttribute('title', /too many steps/);
});

test('blocks warn about missing settings while editing', async ({ app }) => {
  await app.tab('Logic');
  await app.addBlock('Go to screen');
  await expect(app.block('action.goToScreen').locator('.block-problem')).toContainText('no screen picked');
});
