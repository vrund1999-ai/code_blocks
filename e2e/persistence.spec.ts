import { readFile } from 'node:fs/promises';
import { expect, test } from './support/fixtures';
import { template } from './support/projects';

test('autosaves edits and restores them after a reload', async ({ app }) => {
  await app.projectName.fill('My Renamed App');
  await app.paletteItem('Checkbox').click();
  await app.waitForSave();
  await app.reload();
  await expect(app.projectName).toHaveValue('My Renamed App');
  expect(await app.topLevelNames()).toContain('Checkbox 1');
});

test('data an app saves to the device survives a reload', async ({ app }) => {
  await app.loadTemplate('To-do List');
  await app.run();
  const input = app.designCanvas.locator('input.el-input');
  await input.fill('Remember me');
  await input.press('Enter');
  await expect(app.designCanvas.locator('.list-row span')).toHaveText(['Remember me']);
  await app.stop();

  await app.reload();
  await expect(app.projectName).toHaveValue('To-do List');
  await app.run();
  await expect(app.designCanvas.locator('.list-row span')).toHaveText(['Remember me']);
});

test('loads previously saved app data on start', async ({ appNoBoot: app, seed }) => {
  await seed(template('todo'), { tasks: ['Seeded task', 'Another'] });
  await app.goto();
  await app.run();
  await expect(app.designCanvas.locator('.list-row span')).toHaveText(['Seeded task', 'Another']);
});

test.describe('projects menu', () => {
  test('lists, switches between and deletes projects', async ({ app, page }) => {
    await app.loadTemplate('Counter');
    let menu = await app.openProjects();
    const projects = menu.locator('.menu-item.project');
    await expect(projects).toHaveCount(2);
    await expect(menu.locator('.menu-item.project.current')).toContainText('Counter');
    // The open project cannot be deleted.
    await expect(menu.locator('.menu-item.project.current').getByTitle('Delete project')).toHaveCount(0);

    await projects.filter({ hasText: 'Hello Name' }).locator('.link').click();
    await expect(app.projectName).toHaveValue('Hello Name');
    await expect(app.element('Say Hello')).toBeVisible();

    menu = await app.openProjects();
    await menu.locator('.menu-item.project', { hasText: 'Counter' }).getByTitle('Delete project').click();
    await expect
      .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cb.project.')).length))
      .toBe(1);
    if (!(await menu.isVisible())) menu = await app.openProjects();
    await expect(menu.locator('.menu-item.project')).toHaveCount(1);
    await expect(menu.locator('.menu-item.project')).toContainText('Hello Name');
  });

  test('closes when the mouse leaves', async ({ app, page }) => {
    const menu = await app.openProjects();
    await menu.locator('.menu-title').first().hover();
    await page.mouse.move(1400, 800);
    await expect(menu).toBeHidden();
  });
});

test.describe('export and import', () => {
  test('exports the project as a JSON file', async ({ app, page }) => {
    await expect(app.projectName).toHaveValue('Hello Name');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Hello Name.json');
    const data = JSON.parse(await readFile(await file.path(), 'utf8'));
    expect(data.name).toBe('Hello Name');
    expect(data.version).toBe(1);
    expect(data.screens).toHaveLength(1);
    expect(data.graph.nodes).toHaveLength(4);
    expect(data.graph.edges).toHaveLength(3);
  });

  test('imports an exported file (round trip)', async ({ app, page }) => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export/ }).click();
    const path = await (await download).path();

    await app.loadTemplate('Counter');
    await page.locator('input[type="file"]').setInputFiles(path);
    await expect(app.projectName).toHaveValue('Hello Name');
    await app.tab('Logic');
    await expect(app.blocks).toHaveCount(4);
    await expect(app.edges).toHaveCount(3);
  });

  test('rejects a file that is not a project', async ({ app, page }) => {
    await page.locator('input[type="file"]').setInputFiles({
      name: 'not-a-project.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
    });
    await expect(app.globalToasts.first()).toContainText('does not look like a Code Blocks project');
    await expect(app.projectName).toHaveValue('Hello Name');
  });

  test('rejects a file that is not JSON', async ({ app, page }) => {
    await page.locator('input[type="file"]').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('this is { not json'),
    });
    await expect(app.globalToasts.first()).toBeVisible();
    await expect(app.projectName).toHaveValue('Hello Name');
  });
});
