import { expect, test } from './support/fixtures';

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

test('a ready-made theme colours every screen, is saved, and can be undone', async ({ app, page }) => {
  const theme = app.inspector.getByRole('region', { name: 'App theme' });
  await expect(theme).toBeVisible();
  await expect(theme.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true');

  await theme.getByRole('button', { name: 'Night' }).click();
  await expect(theme.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
  const screen = app.designCanvas.locator('.app-view');
  await expect(screen).toHaveCSS('background-color', rgb('#1a1b26'));
  // The screen and its boxes have no colour of their own, so it shows through.
  await expect(app.designCanvas.locator('.el-container.root')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  // Hello Name's text, button and text box all follow it.
  await expect(app.designCanvas.getByText("What's your name?")).toHaveCSS('color', rgb('#e9e9f2'));
  await expect(app.designCanvas.locator('button.el-button')).toHaveCSS('background-color', rgb('#9775fa'));
  // A light purple button gets a dark label, so it stays easy to read.
  await expect(app.designCanvas.locator('button.el-button')).toHaveCSS('color', rgb('#111111'));

  // The running app has it too.
  await app.run();
  await expect(app.designCanvas.locator('.app-view.mode-run')).toHaveCSS('background-color', rgb('#1a1b26'));
  await app.stop();

  await page.keyboard.press('Control+z');
  await expect(screen).toHaveCSS('background-color', rgb('#ffffff'));
  await expect(theme.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+Shift+z');
  await expect(theme.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');

  await app.waitForSave();
  await app.reload();
  await expect(screen).toHaveCSS('background-color', rgb('#1a1b26'));
  await expect(theme.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
});

test('the theme’s colours, font and corners can be set one by one', async ({ app }) => {
  const theme = app.inspector.getByRole('region', { name: 'App theme' });
  const button = app.designCanvas.locator('button.el-button');
  await theme.getByLabel('Main colour').fill('#c2255c');
  await expect(button).toHaveCSS('background-color', rgb('#c2255c'));
  // No preset matches any more.
  await expect(theme.locator('.theme-preset[aria-pressed="true"]')).toHaveCount(0);

  await theme.getByLabel('Font').selectOption('serif');
  await expect(app.designCanvas.locator('.app-view')).toHaveCSS('font-family', /Georgia/);
  await theme.getByLabel('Corners').selectOption('square');
  await expect(button).toHaveCSS('border-radius', '0px');

  // Pale text on white is hard to read, and the panel says so.
  await expect(theme.getByRole('status')).toHaveCount(0);
  await theme.getByLabel('Text colour').fill('#dddddd');
  await expect(theme.getByRole('status')).toContainText('hard to read');
  await theme.getByLabel('Background').fill('#222222');
  await expect(theme.getByRole('status')).toHaveCount(0);
});

test('a Text without a colour of its own follows the theme', async ({ app }) => {
  const theme = app.inspector.getByRole('region', { name: 'App theme' });
  await theme.getByLabel('Text colour').fill('#0b7285');
  const greeting = app.designCanvas.getByText('Your greeting will appear here');
  await expect(greeting).toHaveCSS('color', rgb('#0b7285'));

  await app.select('Greeting');
  const color = app.inspectorField('Color');
  await expect(color).toContainText('Theme colour');
  await color.getByLabel('Color').fill('#e03131');
  await expect(greeting).toHaveCSS('color', rgb('#e03131'));
  await color.getByRole('button', { name: '↺ Use theme colour' }).click();
  await expect(greeting).toHaveCSS('color', rgb('#0b7285'));
  await expect(color).toContainText('Theme colour');
});
