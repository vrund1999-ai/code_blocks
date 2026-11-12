import { expect, type Locator, type Page } from '@playwright/test';

export type Where = 'before' | 'after' | 'inside';

/** Page object for the Code Blocks editor. */
export class AppPage {
  constructor(readonly page: Page) {}

  // ---- Toolbar ---------------------------------------------------------------
  get projectName() {
    return this.page.getByLabel('Project name');
  }
  get runButton() {
    return this.page.locator('button.btn.run');
  }
  get stopButton() {
    return this.page.locator('button.btn.stop');
  }
  get undoButton() {
    return this.page.locator('button[title^="Undo"]');
  }
  get redoButton() {
    return this.page.locator('button[title^="Redo"]');
  }
  get errorPill() {
    return this.page.locator('.error-pill');
  }

  async goto() {
    await this.page.goto('/');
    await expect(this.page.locator('.device').first()).toBeVisible();
  }

  async reload() {
    await this.page.reload();
    await expect(this.page.locator('.device').first()).toBeVisible();
  }

  async tab(name: 'Design' | 'Logic') {
    await this.page.locator('button.tab', { hasText: name }).click();
    if (name === 'Logic') await expect(this.page.locator('.logic-canvas')).toBeVisible();
    else await expect(this.designCanvas).toBeVisible();
  }

  async run() {
    await this.runButton.click();
    await expect(this.stopButton).toBeVisible();
  }

  async stop() {
    await this.stopButton.click();
    await expect(this.runButton).toBeVisible();
  }

  async openProjects() {
    await this.page.locator('button.btn', { hasText: 'Projects' }).click();
    const menu = this.page.locator('.menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  async loadTemplate(name: 'Blank app' | 'Hello Name' | 'Counter' | 'To-do List') {
    const menu = await this.openProjects();
    await menu.locator('.menu-item', { hasText: name }).first().click();
    await expect(this.projectName).toHaveValue(name === 'Blank app' ? 'My App' : name);
  }

  /** Waits until autosave has written the current project name to localStorage. */
  async waitForSave() {
    const name = await this.projectName.inputValue();
    await expect
      .poll(() =>
        this.page.evaluate(() => {
          const id = localStorage.getItem('cb.lastProject');
          const raw = id && localStorage.getItem(`cb.project.${id}`);
          return raw ? (JSON.parse(raw) as { name: string }).name : null;
        }),
      )
      .toBe(name);
  }

  // ---- Surfaces --------------------------------------------------------------
  get designCanvas() {
    return this.page.locator('.design-canvas');
  }
  get logicPreview() {
    return this.page.locator('.logic-preview');
  }
  get inspector() {
    return this.page.locator('aside.inspector');
  }
  get variablesPanel() {
    return this.page.locator('.panel-section', { has: this.page.locator('h3', { hasText: 'Variables' }) });
  }
  get screensPanel() {
    return this.page.locator('.panel-section', { has: this.page.locator('h3', { hasText: 'Screens' }) });
  }
  /** Toasts shown inside the running app. */
  toasts(scope?: Locator) {
    return (scope ?? this.page.locator('body')).locator('.app-view .toast');
  }
  /** Toasts shown by the editor itself (e.g. import errors). */
  get globalToasts() {
    return this.page.locator('.global-toasts .toast');
  }

  // ---- Design ----------------------------------------------------------------
  /** An element on the design canvas, by its name. */
  element(name: string) {
    return this.designCanvas.locator('.el-wrap', {
      has: this.page.locator(':scope > .el-tag', { hasText: new RegExp(`\\s${esc(name)}$`) }),
    });
  }
  get rootElement() {
    return this.designCanvas.locator('.el-wrap-root');
  }
  /** Names of the direct children of the screen root, in order. */
  async topLevelNames() {
    return this.rootElement.locator(':scope > .el-container > .el-wrap > .el-tag').evaluateAll((els) =>
      els.map((e) => (e.textContent ?? '').trim().replace(/^\S+\s/, '')),
    );
  }

  /** Selects an element by clicking near its top-left corner (name tags only show once selected). */
  async select(name: string) {
    await this.element(name).click({ position: { x: 4, y: 4 } });
    await expect(this.inspectorField('Name').locator('input')).toHaveValue(name);
  }

  paletteItem(label: string) {
    return this.page.locator('.palette-item').filter({
      has: this.page.locator('span:not(.icon)', { hasText: new RegExp(`^${esc(label)}$`) }),
    });
  }

  /** Drags with the pointer (dnd-kit) from a source box to a spot on a target box. */
  async pointerDrag(source: Locator, target: Locator, where: Where, hold?: () => Promise<void>) {
    const s = await box(source);
    const sx = s.x + Math.min(20, s.width / 2);
    const sy = s.y + s.height / 2;
    await this.page.mouse.move(sx, sy);
    await this.page.mouse.down();
    // Pass dnd-kit's activation distance first.
    await this.page.mouse.move(sx + 20, sy + 20, { steps: 5 });
    const t = await box(target);
    const x = t.x + Math.min(40, t.width / 2);
    const y = where === 'before' ? t.y + 3 : where === 'after' ? t.y + t.height - 3 : t.y + t.height / 2;
    await this.page.mouse.move(x, y, { steps: 15 });
    if (hold) await hold();
    await this.page.mouse.up();
  }

  async dragPaletteItem(label: string, target: Locator, where: Where, hold?: () => Promise<void>) {
    await this.pointerDrag(this.paletteItem(label), target, where, hold);
  }

  /** The inspector row for a field label (e.g. "Text", "Name"). */
  inspectorField(label: string) {
    return this.inspector.locator('.prop-row', {
      has: this.page.locator('.prop-label', { hasText: new RegExp(`^${esc(label)}`) }),
    });
  }

  /**
   * Turns on 🔗 link for a setting. For 50 ms after a drop, dnd-kit swallows
   * clicks (so a drag never counts as a click), and a test can click that
   * fast; so this clicks again until the setting shows as linked.
   */
  async linkSetting(label: string) {
    const row = this.inspectorField(label);
    const toggle = row.getByRole('button', { name: /link/ });
    await expect(async () => {
      if ((await toggle.textContent())?.trim().endsWith('link')) await toggle.click();
      await expect(row.getByLabel(`${label}: linked to`)).toBeVisible({ timeout: 250 });
    }).toPass();
  }

  async setDevice(label: 'Phone' | 'Tablet' | 'Desktop') {
    await this.designCanvas.locator('.canvas-toolbar .chip', { hasText: label }).click();
  }

  // ---- Logic -----------------------------------------------------------------
  get blocks() {
    return this.page.locator('.react-flow__node');
  }
  get edges() {
    return this.page.locator('.react-flow__edge');
  }
  /** A block by its type (e.g. "action.setText"); `nth` picks among duplicates. */
  block(type: string, nth = 0) {
    return this.blocks.filter({ has: this.page.locator(`[data-node-type="${type}"]`) }).nth(nth);
  }
  blocksOfType(type: string) {
    return this.blocks.filter({ has: this.page.locator(`[data-node-type="${type}"]`) });
  }
  handle(block: Locator, pinId: string, side: 'source' | 'target') {
    return block.locator(`.react-flow__handle.${side}[data-handleid="${pinId}"]`);
  }

  get blockSearch() {
    return this.page.locator('.node-palette input.search');
  }
  paletteBlock(label: string) {
    return this.page.locator('.node-item', { hasText: new RegExp(`^${esc(label)}$`) });
  }

  /** Adds a block by searching and clicking it in the palette. */
  async addBlock(label: string) {
    const before = await this.blocks.count();
    await this.blockSearch.fill(label);
    await this.paletteBlock(label).click();
    await this.blockSearch.fill('');
    await expect(this.blocks).toHaveCount(before + 1);
  }

  async moveBlock(block: Locator, dx: number, dy: number) {
    const b = await box(block.locator('.block-header'));
    await this.page.mouse.move(b.x + 40, b.y + b.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(b.x + 40 + dx, b.y + b.height / 2 + dy, { steps: 10 });
    await this.page.mouse.up();
  }

  /** Draws a wire from an output pin to an input pin. */
  async connect(src: Locator, srcPin: string, dst: Locator, dstPin: string) {
    const a = await box(this.handle(src, srcPin, 'source'));
    const b = await box(this.handle(dst, dstPin, 'target'));
    await this.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
    await this.page.mouse.up();
  }

  async fitView() {
    await this.page.locator('.react-flow__controls-fitview').click();
  }
}

async function box(l: Locator) {
  await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox();
  if (!b) throw new Error(`No bounding box for ${l.toString()}`);
  return b;
}

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
