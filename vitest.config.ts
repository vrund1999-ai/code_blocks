import { defineConfig } from 'vitest/config';

// Unit tests for every package. End-to-end tests (e2e/) run with Playwright.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'html'],
      // CI fails if coverage drops below these: a few points under where it is
      // (QE-9), so a change that adds code without tests is noticed.
      thresholds: { lines: 60, statements: 58, functions: 52, branches: 46 },
    },
  },
});
