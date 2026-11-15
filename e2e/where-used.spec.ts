import { expect, test } from './support/fixtures';
import { build } from './support/projects';

function scoreApp() {
  const b = build('Score keeper');
  const points = b.variable('points', 'number', 0);
  b.variable('unused', 'text', '');
  const add = b.element('button', 'Add point', { label: 'Add point' });
  b.element('text', 'Title', { text: 'Scores' });
  const details = b.addScreen('Details');
  const shown = b.element('text', 'Shown score', {}, details.root);
  shown.props.text = { kind: 'variable', variableId: points.id };
  const click = b.node('event.click', { element: add.id });
  b.exec(click, 'next', b.node('action.changeVariable', { variable: points.id, amount: 1 }));
  return b;
}

test('an element lists the blocks that use it, and each one opens the block', async ({ appNoBoot: app, seed }) => {
  await seed(scoreApp().project);
  await app.goto();

  await app.select('Title');
  const usedBy = app.inspector.getByRole('region', { name: 'Used by' });
  await expect(usedBy).toContainText('No blocks use this yet.');

  await app.select('Add point');
  await expect(usedBy.locator('.used-by-label')).toHaveText(['When “Add point” is clicked → Change “points” by']);
  await usedBy.getByRole('button', { name: 'When “Add point” is clicked → Change “points” by' }).click();
  // The Logic tab opens with that block selected.
  await expect(app.block('event.click')).toHaveClass(/selected/);
  await expect(app.inspector.locator('.inspector-head .title')).toHaveText('When button clicked');
});

test('a variable lists its blocks and linked settings, which open where they are', async ({ appNoBoot: app, seed }) => {
  await seed(scoreApp().project);
  await app.goto();
  const panel = app.variablesPanel;

  await panel.locator('.var-row', { hasText: 'unused' }).click();
  await expect(panel.getByRole('region', { name: 'Used by' })).toContainText('No blocks or elements use this yet.');
  await panel.locator('.var-row', { hasText: 'unused' }).click();

  await panel.locator('.var-row', { hasText: 'points' }).click();
  const usedBy = panel.getByRole('region', { name: 'Used by' });
  await expect(usedBy.locator('.used-by-label')).toHaveText(['Change “points” by', '“Shown score”: Text']);

  // A setting on another screen: the Design tab shows that screen, with the element selected.
  await usedBy.getByRole('button', { name: '“Shown score”: Text' }).click();
  await expect(app.designCanvas.locator('.device-title')).toHaveText('Details');
  await expect(app.inspectorField('Name').locator('input')).toHaveValue('Shown score');

  await usedBy.getByRole('button', { name: 'Change “points” by' }).click();
  await expect(app.block('action.changeVariable')).toHaveClass(/selected/);
  // The list follows the project: a new block that sets the variable shows up.
  await app.addBlock('Set variable');
  await app.block('action.setVariable').getByLabel('Variable').selectOption({ label: 'points' });
  // The Logic tab has its own Variables panel, with the variable closed.
  await app.variablesPanel.locator('.var-row', { hasText: 'points' }).click();
  await expect(app.variablesPanel.getByRole('region', { name: 'Used by' }).locator('.used-by-label')).toHaveText([
    'Change “points” by',
    'Set “points”',
    '“Shown score”: Text',
  ]);
});
