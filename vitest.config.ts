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
    },
  },
});
