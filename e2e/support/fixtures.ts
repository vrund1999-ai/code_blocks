import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import type { Project } from '../../apps/editor/src/model/types';
import { AppPage } from './AppPage';

/** The password of the accounts tests make. */
export const TEST_PASSWORD = 'e2e password';

interface Options {
  /**
   * Start signed in to a new account, for tests of the server features.
   * Set it for a whole file with `test.use({ signedIn: true })`.
   */
  signedIn: boolean;
}

interface Fixtures {
  /** The account the test is signed in to (with `signedIn`), or null. */
  account: { email: string } | null;
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

export const test = base.extend<Options & Fixtures>({
  signedIn: [false, { option: true }],

  account: async ({ page, signedIn }, use) => {
    if (!signedIn) return use(null);
    // The page shares cookies with page.request, so it starts signed in.
    const email = `e2e-${randomUUID()}@example.test`;
    const res = await page.request.post('/api/auth/signup', { data: { email, password: TEST_PASSWORD } });
    expect(res.ok(), await res.text()).toBe(true);
    await use({ email });
  },

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

  appNoBoot: async ({ page, account: _ }, use) => {
    await use(new AppPage(page));
  },

  app: async ({ page, account: _ }, use) => {
    const app = new AppPage(page);
    await app.goto();
    await use(app);
  },
});

export { expect };
