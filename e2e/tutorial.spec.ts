import { expect, test } from './support/fixtures';

test.use({ tutorial: true });

test('a first visit offers the tutorial, which walks through building a first app', async ({ app, page }) => {
  const card = page.getByRole('dialog', { name: '👋 Build your first app' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Let’s go' }).click();

  // A new, empty project, so the starter one is left as it was.
  await expect(app.projectName).toHaveValue('My first app');
  const tutorial = page.locator('.tutorial');
  await expect(tutorial.getByRole('heading')).toHaveText('Add a button');
  await expect(tutorial).toContainText('Step 1 of 6');
  // It points at the Button in Elements.
  await expect(app.paletteItem('Button')).toHaveClass(/tour-target/);
  await app.paletteItem('Button').click();

  await expect(tutorial.getByRole('heading')).toHaveText('Give it a label');
  await app.select('Button 1');
  await app.inspectorField('Label').locator('input').fill('Say hi');

  await expect(tutorial.getByRole('heading')).toHaveText('Open the Logic tab');
  await app.tab('Logic');

  await expect(tutorial.getByRole('heading')).toHaveText('Start with “When…”');
  await expect(app.paletteBlock('When button clicked')).toHaveClass(/tour-target/);
  await app.addBlock('When button clicked');
  await app.block('event.click').getByLabel('Button').selectOption({ index: 1 });

  await expect(tutorial.getByRole('heading')).toHaveText('Make it do something');
  await app.addBlock('Show message');
  // Line the two blocks up, so the arrow is easy to drag.
  await page.getByRole('button', { name: '✨ Tidy up' }).click();
  await app.connect(app.block('event.click'), 'next', app.block('action.toast'), 'in');

  await expect(tutorial.getByRole('heading')).toHaveText('Try it');
  await expect(page.locator('[data-tour="run"]')).toHaveClass(/tour-target/);
  await app.run();
  await app.logicPreview.getByRole('button', { name: 'Say hi' }).click();

  await expect(tutorial.getByRole('heading')).toHaveText('🎉 You made an app!');
  await tutorial.getByRole('button', { name: 'Finish' }).click();
  await expect(tutorial).toHaveCount(0);
  await expect(page.locator('.tour-target')).toHaveCount(0);

  // It's offered only once.
  await page.reload();
  await expect(app.projectName).toHaveValue('My first app');
  await expect(tutorial).toHaveCount(0);
});

test('“No thanks” keeps the project, and the Projects menu starts the tutorial again', async ({ app, page }) => {
  const tutorial = page.locator('.tutorial');
  await tutorial.getByRole('button', { name: 'No thanks' }).click();
  await expect(tutorial).toHaveCount(0);
  await expect(app.projectName).toHaveValue('Hello Name');

  await page.reload();
  await expect(app.projectName).toBeVisible();
  await expect(tutorial).toHaveCount(0);

  const menu = await app.openProjects();
  await menu.getByRole('button', { name: /Tutorial/ }).click();
  await expect(tutorial.getByRole('heading')).toHaveText('👋 Build your first app');
  // Closing it partway leaves things as they are.
  await tutorial.getByRole('button', { name: 'Let’s go' }).click();
  await expect(tutorial.getByRole('heading')).toHaveText('Add a button');
  await tutorial.getByRole('button', { name: 'Close the tutorial' }).click();
  await expect(tutorial).toHaveCount(0);
  await expect(app.projectName).toHaveValue('My first app');
});

test('someone who has made projects before isn’t offered it', async ({ appNoBoot: app, seed, page }) => {
  const { build } = await import('./support/projects');
  await seed(build('Mine').project);
  await app.goto();
  await expect(app.projectName).toHaveValue('Mine');
  await expect(page.locator('.tutorial')).toHaveCount(0);
});
