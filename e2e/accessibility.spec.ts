import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { guestList, template } from './support/projects';

/** The rules axe breaks, with the elements that break them, so a failure says what to fix. */
async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
  return violations.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`);
}

test.use({ signedIn: true });
// Each axe scan takes a few seconds on the bigger pages, such as the Logic tab.
test.describe.configure({ timeout: 90_000 });

test.describe('the editor passes automated accessibility checks', () => {
  test.beforeEach(async ({ appNoBoot: app, seed }) => {
    await seed(guestList().project);
    await app.goto();
  });

  test('in the Design tab', async ({ appNoBoot: app, page }) => {
    expect(await violations(page), 'Design tab').toEqual([]);
    await app.select('Guest name');
    expect(await violations(page), 'an element in the inspector').toEqual([]);
    await app.run();
    expect(await violations(page), 'running').toEqual([]);
  });

  test('in the Logic tab', async ({ appNoBoot: app, page }) => {
    await app.tab('Logic');
    expect(await violations(page), 'Logic tab').toEqual([]);
    await app.fitView();
    for (const type of ['table.query', 'data.makeRecord', 'action.setText']) {
      await app.block(type).locator('.block-header').click();
      expect(await violations(page), `a ${type} block in the inspector`).toEqual([]);
    }
  });

  test('in the Data tab and the menus', async ({ appNoBoot: app, page }) => {
    await app.tab('Data');
    expect(await violations(page), 'Data tab').toEqual([]);

    await app.openProjects();
    expect(await violations(page), 'projects menu').toEqual([]);
    await page.keyboard.press('Escape');

    await app.openServer();
    expect(await violations(page), 'server menu').toEqual([]);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /👤/ }).first().click();
    expect(await violations(page), 'account menu').toEqual([]);
  });
});

test('a running To-do List passes automated accessibility checks', async ({ appNoBoot: app, seed, page }) => {
  await seed(template('todo'));
  await app.goto();
  await app.run();
  await app.designCanvas.getByRole('textbox').fill('Buy milk');
  await app.designCanvas.getByRole('textbox').press('Enter');
  await expect(app.designCanvas.getByText('Buy milk')).toBeVisible();
  expect(await violations(page), 'running To-do List').toEqual([]);
});

test('an empty app passes automated accessibility checks', async ({ appNoBoot: app, seed, page }) => {
  await seed(template('blank'));
  await app.goto();
  expect(await violations(page), 'empty Design tab').toEqual([]);
  await app.tab('Logic');
  expect(await violations(page), 'empty Logic tab').toEqual([]);
  await app.tab('Data');
  expect(await violations(page), 'empty Data tab').toEqual([]);
});

test('a published app passes automated accessibility checks', async ({ appNoBoot: app, seed, page, browser }) => {
  await seed(guestList().project);
  await app.goto();
  await page.locator('button[aria-expanded]', { hasText: '🔗 Publish' }).click();
  const menu = page.getByRole('dialog', { name: 'Publish' });
  await menu.getByRole('button', { name: '🔗 Publish' }).click();
  const url = (await menu.locator('.publish-link code').textContent())!;
  expect(await violations(page), 'publish menu').toEqual([]);

  const visitor = await browser.newContext();
  const visit = await visitor.newPage();
  await visit.goto(url);
  await expect(visit.locator('.published-app')).toBeVisible();
  await expect(visit.getByRole('heading', { level: 1 })).toHaveText('Guest list');
  expect(await violations(visit), 'published app').toEqual([]);
  await visitor.close();
});

test('the menus open and close from the keyboard', async ({ app, page }) => {
  for (const name of ['Projects', 'Server', 'Publish', '👤']) {
    const button = page.locator('.menu-anchor > button', { hasText: name });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    // The keyboard is back where it was, not lost on the page.
    await expect(button).toBeFocused();
  }
  // Icon-only buttons say what they do.
  await expect(app.undoButton).toHaveAccessibleName('Undo');
  await expect(app.redoButton).toHaveAccessibleName('Redo');
});
