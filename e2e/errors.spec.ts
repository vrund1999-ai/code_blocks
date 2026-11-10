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
