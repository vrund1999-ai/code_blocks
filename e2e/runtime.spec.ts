import type { Page } from '@playwright/test';
import { API, fakeApi } from './support/api';
import { expect, test } from './support/fixtures';
import { build } from './support/projects';

/**
 * Stops the page's clock, so time only moves with `page.clock.runFor`. An
 * installed clock otherwise keeps running, and on a slow machine timers fire
 * more often than a test expects. It stops a second ahead, since time keeps
 * moving while the test reads it; nothing runs before the app does.
 */
async function stopTime(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
}

// These tests control time with Playwright's fake clock, so they don't wait in real time.

test('an "Every few seconds" block runs repeatedly', async ({ appNoBoot: app, seed, page }) => {
  const b = build('Ticker');
  const ticks = b.variable('ticks', 'number', 0);
  const label = b.element('text', 'Ticks');
  label.props.text = { kind: 'variable', variableId: ticks.id };
  const timer = b.node('event.timer', { seconds: 1 });
  const inc = b.node('action.changeVariable', { variable: ticks.id, amount: 1 });
  b.exec(timer, 'next', inc);
  await seed(b.project);
  await page.clock.install();
  await app.goto();
  await stopTime(page);

  await app.run();
  const text = app.designCanvas.locator('.el-text');
  await expect(text).toHaveText('0');
  await page.clock.runFor(1_000);
  await expect(text).toHaveText('1');
  await page.clock.runFor(2_000);
  await expect(text).toHaveText('3');
});

test('Stop halts timers', async ({ appNoBoot: app, seed, page }) => {
  const b = build('Toaster');
  const timer = b.node('event.timer', { seconds: 1 });
  const toast = b.node('action.toast', { message: 'tick' });
  b.exec(timer, 'next', toast);
  await seed(b.project);
  await page.clock.install();
  await app.goto();
  await stopTime(page);

  await app.run();
  await page.clock.runFor(1_000);
  await expect(app.toasts().first()).toHaveText('tick');
  await app.stop();
  await page.clock.runFor(5_000);
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('a Wait block delays what comes after it', async ({ appNoBoot: app, seed, page }) => {
  const b = build('Waiter');
  const button = b.element('button', 'Start', { label: 'Start' });
  const status = b.element('text', 'Status', { text: 'waiting' });
  const click = b.node('event.click', { element: button.id });
  const wait = b.node('action.wait', { seconds: 2 });
  const set = b.node('action.setText', { element: status.id, text: 'Done' });
  b.exec(click, 'next', wait);
  b.exec(wait, 'next', set);
  await seed(b.project);
  await page.clock.install();
  await app.goto();
  await stopTime(page);

  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Start' }).click();
  const text = app.designCanvas.locator('.el-text');
  await page.clock.runFor(1_000);
  await expect(text).toHaveText('waiting');
  await page.clock.runFor(1_500);
  await expect(text).toHaveText('Done');
});

test('Stop cancels a pending Wait block, so what comes after it never runs', async ({ appNoBoot: app, seed, page }) => {
  const requests = await fakeApi(page, '/ping', { body: 'pong' });
  const b = build('Waiter');
  const button = b.element('button', 'Start', { label: 'Start' });
  const status = b.element('text', 'Status', { text: 'waiting' });
  const click = b.node('event.click', { element: button.id });
  const wait = b.node('action.wait', { seconds: 2 });
  const fetch = b.node('action.fetch', { url: 'api.example.test/ping' });
  const set = b.node('action.setText', { element: status.id });
  b.exec(click, 'next', wait);
  b.exec(wait, 'next', fetch);
  b.exec(fetch, 'next', set);
  b.data(fetch, 'result', set, 'text');
  await seed(b.project);
  await page.clock.install();
  await app.goto();
  await stopTime(page);

  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Start' }).click();
  await page.clock.runFor(1_000);
  await app.stop();
  // The wait would have ended here, and sent the request.
  await page.clock.runFor(5_000);

  // Running again sends one request: this run's, not the stopped one's.
  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Start' }).click();
  await page.clock.runFor(2_500);
  await expect(app.designCanvas.locator('.el-text')).toHaveText('pong');
  expect(requests.map((r) => r.url())).toEqual([`${API}/ping`]);
});

test('toasts disappear after a few seconds', async ({ appNoBoot: app, seed, page }) => {
  const b = build('Toast');
  const button = b.element('button', 'Hi', { label: 'Hi' });
  const click = b.node('event.click', { element: button.id });
  const toast = b.node('action.toast', { message: 'Hello there' });
  b.exec(click, 'next', toast);
  await seed(b.project);
  await page.clock.install();
  await app.goto();
  await stopTime(page);

  await app.run();
  await app.designCanvas.getByRole('button', { name: 'Hi' }).click();
  await expect(app.toasts().first()).toHaveText('Hello there');
  await page.clock.runFor(3_500);
  await expect(app.toasts()).toHaveCount(0);
});

test('input and checkbox changes fire "When value changes"', async ({ appNoBoot: app, seed }) => {
  const b = build('Echo');
  const box = b.element('input', 'Box', { placeholder: 'Type' });
  const echo = b.element('text', 'Echo', { text: '' });
  const change = b.node('event.inputChange', { element: box.id });
  const set = b.node('action.setText', { element: echo.id });
  b.exec(change, 'next', set);
  b.data(change, 'value', set, 'text');
  await seed(b.project);
  await app.goto();

  await app.run();
  await app.designCanvas.locator('input.el-input').pressSequentially('abc');
  await expect(app.designCanvas.locator('.el-text')).toHaveText('abc');
});
