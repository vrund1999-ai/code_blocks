import { expect, test } from './support/fixtures';
import { build } from './support/projects';

test.describe('drag and drop', () => {
  // Pointer-drag automation is unreliable in Firefox and WebKit; see QE-11.
  test.fixme(({ browserName }) => browserName !== 'chromium', 'QE-11: drag tests only run in Chromium for now');

  test('drags an element from the palette to below the greeting', async ({ app, page }) => {
    await app.dragPaletteItem('Checkbox', app.element('Greeting'), 'after', async () => {
      await expect(page.locator('.drop-bar')).toHaveCount(1);
      await expect(page.locator('.drag-chip')).toBeVisible();
    });
    await expect(page.locator('.drop-bar')).toHaveCount(0);
    expect(await app.topLevelNames()).toEqual(['Title', 'Name Box', 'Say Hello', 'Greeting', 'Checkbox 1']);
  });

  test('drops an element before another one', async ({ app }) => {
    await app.dragPaletteItem('Image', app.element('Title'), 'before');
    expect((await app.topLevelNames())[0]).toBe('Image 1');
  });

  test('reorders elements by dragging them', async ({ app }) => {
    await app.pointerDrag(app.element('Greeting'), app.element('Title'), 'before');
    expect(await app.topLevelNames()).toEqual(['Greeting', 'Title', 'Name Box', 'Say Hello']);
  });

  test('drops an element inside a container', async ({ appNoBoot: app, seed }) => {
    const b = build('Boxes');
    b.element('text', 'Heading', { text: 'Heading' });
    b.element('container', 'Card', { border: true });
    await seed(b.project);
    await app.goto();

    await app.dragPaletteItem('Button', app.element('Card'), 'inside');
    await expect(app.element('Card').locator('.el-wrap-button')).toHaveCount(1);
    expect(await app.topLevelNames()).toEqual(['Heading', 'Card']);
  });

  test('a drop outside the screen does nothing', async ({ app, page }) => {
    await app.pointerDrag(app.paletteItem('Text'), page.locator('.inspector'), 'inside');
    expect(await app.topLevelNames()).toHaveLength(4);
  });
});

test.describe('click to add', () => {
  test('adds to the end of the screen when nothing is selected', async ({ app }) => {
    await app.paletteItem('Text').click();
    expect(await app.topLevelNames()).toEqual(['Title', 'Name Box', 'Say Hello', 'Greeting', 'Text 1']);
  });

  test('adds next to the selected element', async ({ app }) => {
    await app.select('Name Box');
    await app.paletteItem('Button').click();
    expect(await app.topLevelNames()).toEqual(['Title', 'Name Box', 'Button 1', 'Say Hello', 'Greeting']);
  });
});

test.describe('inspector', () => {
  test('edits text, name and style of an element', async ({ app }) => {
    await app.select('Title');
    await app.inspectorField('Text').locator('textarea').fill('Hi there!');
    await expect(app.designCanvas.locator('.el-text').first()).toHaveText('Hi there!');

    await app.inspectorField('Name').locator('input').fill('Heading');
    await expect(app.element('Heading')).toBeVisible();

    await app.inspectorField('Size').locator('select').selectOption('small');
    await expect(app.designCanvas.locator('.el-text').first()).toHaveCSS('font-size', '13px');
  });

  test('clicking the screen background selects the screen', async ({ app }) => {
    await app.rootElement.click({ position: { x: 10, y: 10 } });
    await expect(app.inspector.locator('.title')).toHaveText('Screen background');
  });

  test('Escape clears the selection', async ({ app, page }) => {
    await app.select('Title');
    await page.keyboard.press('Escape');
    await expect(app.inspector).toContainText('Click an element on the screen');
  });

  test('deletes the selected element with the Delete key', async ({ app, page }) => {
    await app.select('Greeting');
    await page.keyboard.press('Delete');
    expect(await app.topLevelNames()).toEqual(['Title', 'Name Box', 'Say Hello']);
  });

  test('deletes an element with the inspector button', async ({ app }) => {
    await app.select('Title');
    await app.inspector.getByRole('button', { name: 'Delete', exact: true }).click();
    expect(await app.topLevelNames()).toEqual(['Name Box', 'Say Hello', 'Greeting']);
  });

  test('links a text to a variable', async ({ appNoBoot: app, seed }) => {
    const b = build('Binding');
    b.variable('message', 'text', 'Hello from a variable');
    b.element('text', 'Label', { text: 'Plain text' });
    await seed(b.project);
    await app.goto();

    await app.select('Label');
    await app.inspectorField('Text').getByRole('button', { name: /link/ }).click();
    await expect(app.inspectorField('Text').locator('select.bound option:checked')).toHaveText(/message/);
    await expect(app.designCanvas.locator('.el-text')).toHaveText('Hello from a variable');

    await app.run();
    await expect(app.designCanvas.locator('.el-text')).toHaveText('Hello from a variable');
    await app.stop();

    await app.select('Label');
    await app.inspectorField('Text').getByRole('button', { name: /linked/ }).click();
    await expect(app.designCanvas.locator('.el-text')).toHaveText('Some text');
  });

  test('"When clicked…" adds an event block in the Logic tab', async ({ app }) => {
    await app.select('Say Hello');
    await app.inspector.getByRole('button', { name: /When clicked/ }).click();
    await expect(app.page.locator('.logic-canvas')).toBeVisible();
    await expect(app.blocksOfType('event.click')).toHaveCount(2);
  });
});

test('switches device frame sizes', async ({ app }) => {
  // The frame may be squeezed to fit the window, so check the width it asks for.
  const device = app.designCanvas.locator('.device');
  await expect(device).toHaveAttribute('style', /width: 390px/);
  await app.setDevice('Tablet');
  await expect(device).toHaveAttribute('style', /width: 768px/);
  await app.setDevice('Desktop');
  await expect(device).toHaveAttribute('style', /width: 1100px/);
  await app.setDevice('Phone');
  await expect(device).toHaveAttribute('style', /width: 390px/);
});
