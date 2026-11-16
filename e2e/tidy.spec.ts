import type { Locator } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { build } from './support/projects';

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function boxes(blocks: Locator) {
  const out: Box[] = [];
  for (let i = 0; i < (await blocks.count()); i++) out.push((await blocks.nth(i).boundingBox())!);
  return out;
}

test('Tidy up lines the blocks up left to right, and Undo puts them back', async ({ appNoBoot: app, seed, page }) => {
  const b = build('Messy');
  const button = b.element('button', 'Go', { label: 'Go' });
  const label = b.element('text', 'Greeting');
  // Every block piled up in one place, and the chain written backwards.
  const at = { x: 300, y: 200 };
  const click = b.node('event.click', { element: button.id }, at);
  const set = b.node('action.setText', { element: label.id }, { x: 310, y: 210 });
  const join = b.node('data.join', {}, { x: 290, y: 190 });
  const toast = b.node('action.toast', {}, { x: 320, y: 220 });
  b.exec(click, 'next', set);
  b.exec(set, 'next', toast);
  b.data(join, 'value', set, 'text');
  b.node('event.timer', { seconds: 5 }, { x: 305, y: 205 });
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');
  await expect(app.blocks).toHaveCount(5);
  const before = await app.blocks.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform));
  expect(before).toContain('translate(300px, 200px)');

  await page.getByRole('button', { name: '✨ Tidy up' }).click();
  await expect(async () => {
    const after = await boxes(app.blocks);
    for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) expect(overlap(after[i], after[j])).toBe(false);
    const [c, s, t, j, timer] = [
      await app.block('event.click').boundingBox(),
      await app.block('action.setText').boundingBox(),
      await app.block('action.toast').boundingBox(),
      await app.block('data.join').boundingBox(),
      await app.block('event.timer').boundingBox(),
    ];
    // The arrows read left to right, along one row.
    expect(s!.x).toBeGreaterThan(c!.x + c!.width);
    expect(t!.x).toBeGreaterThan(s!.x + s!.width);
    expect(Math.round(s!.y)).toBe(Math.round(c!.y));
    // The value sits under the When… block, left of the block it feeds.
    expect(Math.round(j!.x)).toBe(Math.round(c!.x));
    expect(j!.y).toBeGreaterThan(c!.y);
    // The timer is on its own, below the rest.
    expect(timer!.y).toBeGreaterThan(j!.y + j!.height);
  }).toPass();

  // One step back puts every block where it was on the graph (the zoom stays as it is).
  const transforms = () => app.blocks.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform));
  await app.undoButton.click();
  await expect.poll(transforms).toEqual(before);
});

test('Tidy up is offered once there are blocks to line up', async ({ appNoBoot: app, seed, page }) => {
  const b = build('One block');
  b.node('event.timer', { seconds: 1 });
  await seed(b.project);
  await app.goto();
  await app.tab('Logic');
  await expect(app.blocks).toHaveCount(1);
  await expect(page.getByRole('button', { name: '✨ Tidy up' })).toHaveCount(0);
  await app.addBlock('Show message');
  await expect(page.getByRole('button', { name: '✨ Tidy up' })).toBeVisible();
});
