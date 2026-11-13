import { test as base, expect } from '@playwright/test';
import type { Project } from '../../apps/editor/src/model/types';
import { AppPage } from './AppPage';

interface Fixtures {
  /** Console errors and uncaught exceptions; any left at the end fails the test. */
  consoleErrors: string[];
  /**
   * Stores a project in localStorage so the editor opens it on boot.
   * Call before `appNoBoot.goto()`. Only applies to the first page load,
   * so reloads still exercise the real autosave.
   */
  seed: (project: Project, appStorage?: Record<string, unknown>) => Promise<void>;
  /** The editor page object, already opened. */
  app: AppPage;
  /** The editor page object without opening the page (use with `seed`). */
  appNoBoot: AppPage;
}

export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      await use(errors);
      expect(errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],

  seed: async ({ page }, use) => {
    await use(async (project, appStorage = {}) => {
      // Same keys as saveProject() in apps/editor/src/model/persistence.ts.
      await page.addInitScript(
        ({ project, appStorage }) => {
          if (sessionStorage.getItem('cb.e2e.seeded')) return;
          sessionStorage.setItem('cb.e2e.seeded', '1');
          localStorage.setItem(`cb.project.${project.id}`, JSON.stringify(project));
          localStorage.setItem('cb.projects', JSON.stringify([{ id: project.id, name: project.name, updatedAt: Date.now() }]));
          localStorage.setItem('cb.lastProject', project.id);
          for (const [k, v] of Object.entries(appStorage)) {
            localStorage.setItem(`cb.app.${project.id}.${k}`, JSON.stringify(v));
          }
        },
        { project, appStorage },
      );
    });
  },

  appNoBoot: async ({ page }, use) => {
    await use(new AppPage(page));
  },

  app: async ({ page }, use) => {
    const app = new AppPage(page);
    await app.goto();
    await use(app);
  },
});

export { expect };
