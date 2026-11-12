import { expect, test } from './support/fixtures';

test.describe('Design tab', () => {
  test('copy and paste an element puts the copy right after it', async ({ app, page }) => {
    await app.select('Say Hello');
    await page.keyboard.press('ControlOrMeta+c');
    await expect(app.globalToasts.last()).toHaveText(/^Copied “Say Hello”\. Press (Ctrl|⌘)\+V to paste\.$/);
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(() => app.topLevelNames()).toEqual(['Title', 'Name Box', 'Say Hello', 'Say Hello 2', 'Greeting']);
    // The copy is selected, so pasting again goes after it.
    await expect(app.inspectorField('Name').locator('input')).toHaveValue('Say Hello 2');
    await page.keyboard.press('ControlOrMeta+v');
    await expect
      .poll(() => app.topLevelNames())
      .toEqual(['Title', 'Name Box', 'Say Hello', 'Say Hello 2', 'Say Hello 3', 'Greeting']);

    await app.undoButton.click();
    await expect.poll(() => app.topLevelNames()).toEqual(['Title', 'Name Box', 'Say Hello', 'Say Hello 2', 'Greeting']);
  });

  test('duplicate with Ctrl+D or the Duplicate button, and cut with Ctrl+X', async ({ app, page }) => {
    await app.select('Title');
    await page.keyboard.press('ControlOrMeta+d');
    await expect.poll(() => app.topLevelNames()).toEqual(['Title', 'Title 2', 'Name Box', 'Say Hello', 'Greeting']);
    await app.inspector.getByRole('button', { name: 'Duplicate' }).click();
    await expect
      .poll(() => app.topLevelNames())
      .toEqual(['Title', 'Title 2', 'Title 3', 'Name Box', 'Say Hello', 'Greeting']);

    // Cut the greeting and paste it after the first title.
    await app.select('Greeting');
    await page.keyboard.press('ControlOrMeta+x');
    await expect(app.globalToasts.last()).toContainText('Cut “Greeting”');
    await expect.poll(() => app.topLevelNames()).toEqual(['Title', 'Title 2', 'Title 3', 'Name Box', 'Say Hello']);
    await app.select('Title');
    await page.keyboard.press('ControlOrMeta+v');
    await expect
      .poll(() => app.topLevelNames())
      .toEqual(['Title', 'Greeting', 'Title 2', 'Title 3', 'Name Box', 'Say Hello']);
  });

  test('typing in a settings field still copies and pastes text', async ({ app, page }) => {
    await app.select('Title');
    const name = app.inspectorField('Name').locator('input');
    await name.selectText();
    await page.keyboard.press('ControlOrMeta+c');
    await name.press('End');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(name).toHaveValue('TitleTitle');
    await expect.poll(() => app.topLevelNames()).toEqual(['TitleTitle', 'Name Box', 'Say Hello', 'Greeting']);
  });
});

test.describe('Logic tab', () => {
  test('copy several blocks keeps the wire between them', async ({ app, page }) => {
    await app.tab('Logic');
    await expect(app.blocks).toHaveCount(4);
    await expect(app.edges).toHaveCount(3);

    await app.block('event.click').locator('.block-title').click();
    await app.block('action.setText').locator('.block-title').click({ modifiers: ['ControlOrMeta'] });
    await expect(app.page.locator('.react-flow__node.selected')).toHaveCount(2);
    await expect(app.inspector.getByRole('button', { name: 'Duplicate 2 blocks' })).toBeVisible();

    await page.keyboard.press('ControlOrMeta+c');
    await expect(app.globalToasts.last()).toContainText('Copied 2 blocks');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(app.blocks).toHaveCount(6);
    // The arrow between the two copies comes along; wires to blocks left behind don't.
    await expect(app.edges).toHaveCount(4);
    await expect(app.blocksOfType('event.click')).toHaveCount(2);
    // The copies are selected, ready to be dragged somewhere else.
    await expect(app.page.locator('.react-flow__node.selected')).toHaveCount(2);
    await expect(app.blocksOfType('event.click').nth(1)).toHaveClass(/selected/);

    await app.undoButton.click();
    await expect(app.blocks).toHaveCount(4);
    await expect(app.edges).toHaveCount(3);
  });

  test('duplicate and cut blocks', async ({ app, page }) => {
    await app.tab('Logic');
    await app.block('data.join').locator('.block-title').click();
    await app.inspector.getByRole('button', { name: 'Duplicate' }).click();
    await expect(app.blocksOfType('data.join')).toHaveCount(2);
    // The copy keeps its settings: "Hello, " typed into First.
    await expect(app.block('data.join', 1).locator('.pin-row.in input').first()).toHaveValue('Hello, ');

    await page.keyboard.press('ControlOrMeta+x');
    await expect(app.blocksOfType('data.join')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+d'); // nothing selected now: does nothing
    await expect(app.blocksOfType('data.join')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+v');
    await expect(app.blocksOfType('data.join')).toHaveCount(2);
  });

  test('blocks only paste in the Logic tab, and elements only in the Design tab', async ({ app, page }) => {
    await app.tab('Logic');
    await app.block('action.setText').locator('.block-title').click();
    await page.keyboard.press('ControlOrMeta+c');
    await app.tab('Design');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(app.globalToasts.last()).toHaveText('Blocks can be pasted in the Logic tab.');
    await expect.poll(() => app.topLevelNames()).toEqual(['Title', 'Name Box', 'Say Hello', 'Greeting']);
    await app.tab('Logic');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(app.blocksOfType('action.setText')).toHaveCount(2);
  });
});
