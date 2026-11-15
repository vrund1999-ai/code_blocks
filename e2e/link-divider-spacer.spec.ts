import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test('add a link, a divider and a spacer and change their settings', async ({ appNoBoot: app, seed }) => {
  await seed(build('Empty').project);
  await app.goto();
  const canvas = app.designCanvas;

  await app.paletteItem('Link').click();
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Link 1');
  const link = canvas.locator('.el-link');
  await expect(link).toHaveText('Visit our website');
  await app.inspectorField('Text').locator('input').fill('Our menu');
  await app.inspectorField('Web address').locator('input').fill('example.com/menu');
  await expect(link).toHaveText('Our menu');
  // While designing, a link doesn't open anything, so clicking it selects it.
  await expect(link).not.toHaveAttribute('href');

  await app.paletteItem('Divider').click();
  const divider = canvas.getByRole('separator');
  await expect(divider).toBeVisible();
  await app.inspectorField('Thickness').locator('input').fill('4');
  await expect.poll(async () => (await divider.boundingBox())?.height).toBe(4);

  await app.paletteItem('Spacer').click();
  const spacer = canvas.locator('.el-spacer');
  await expect.poll(async () => (await spacer.boundingBox())?.height).toBe(24);
  await app.inspectorField('Size').locator('input').fill('60');
  await expect.poll(async () => (await spacer.boundingBox())?.height).toBe(60);

  await app.rootElement.click({ position: { x: 5, y: 5 } });
  await link.click();
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Link 1');
});

test('links open safe addresses in a new tab while running, and Set text changes them', async ({ appNoBoot: app, seed }) => {
  const b = build('Links');
  const site = b.element('link', 'Site', { text: 'Our site', url: 'example.com' });
  b.element('divider', 'Line');
  b.element('link', 'Mail', { text: 'Email us', url: 'mailto:hello@example.com' });
  b.element('spacer', 'Gap', { size: 30 });
  b.element('link', 'Sneaky', { text: 'Sneaky', url: 'javascript:alert(1)' });
  const rename = b.element('button', 'Rename', { label: 'Rename' });
  const click = b.node('event.click', { element: rename.id });
  b.exec(click, 'next', b.node('action.setText', { element: site.id, text: 'Visit us' }));
  await seed(b.project);
  await app.goto();
  await app.run();
  const canvas = app.designCanvas;

  const ours = canvas.getByRole('link', { name: 'Our site' });
  await expect(ours).toHaveAttribute('href', 'https://example.com');
  // The editor's preview always opens a new tab, so the editor isn't left.
  await expect(ours).toHaveAttribute('target', '_blank');
  await expect(ours).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(canvas.getByRole('link', { name: 'Email us' })).toHaveAttribute('href', 'mailto:hello@example.com');
  // An address that could run code isn't a link at all.
  const sneaky = canvas.locator('.el-link', { hasText: 'Sneaky' });
  await expect(sneaky).not.toHaveAttribute('href');
  await expect(canvas.getByRole('link')).toHaveCount(2);

  await expect(canvas.getByRole('separator')).toBeVisible();
  await expect.poll(async () => (await canvas.locator('.el-spacer').boundingBox())?.height).toBe(30);

  await canvas.getByRole('button', { name: 'Rename' }).click();
  await expect(canvas.getByRole('link', { name: 'Visit us' })).toHaveAttribute('href', 'https://example.com');
});

test.describe('published', () => {
  test.use({ signedIn: true });

  test('a published app opens a link in the same tab unless set to a new one', async ({ appNoBoot: app, seed, page, browser }) => {
    const b = build('Shop');
    b.element('link', 'Same', { text: 'Same tab', url: 'https://example.com/a', newTab: false });
    b.element('link', 'New', { text: 'New tab', url: 'https://example.com/b' });
    await seed(b.project);
    await app.goto();
    const menu = page.getByRole('dialog', { name: 'Publish' });
    await page.locator('button[aria-expanded]', { hasText: '🔗 Publish' }).click();
    await menu.getByRole('button', { name: '🔗 Publish' }).click();
    const url = (await menu.locator('.publish-link code').textContent())!;

    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(url);
    const view = visitor.locator('.published-app');
    await expect(view.getByRole('link', { name: 'Same tab' })).toHaveAttribute('href', 'https://example.com/a');
    await expect(view.getByRole('link', { name: 'Same tab' })).not.toHaveAttribute('target');
    await expect(view.getByRole('link', { name: 'New tab' })).toHaveAttribute('target', '_blank');
    await visitorContext.close();
  });
});
