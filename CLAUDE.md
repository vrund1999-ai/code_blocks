# Code Blocks — project instructions

## Testing
- Before opening a PR, run `npm run check` and `npm run test:e2e`. Both must pass; CI runs the same checks.
- Any user-facing change needs a new or updated Playwright spec in `e2e/`. Engine and store logic needs Vitest tests next to the code (`src/**/*.test.ts`).
- In end-to-end tests:
  - Use the helpers in `e2e/support/` (`AppPage`, `seed`, `build`).
  - Never use fixed sleeps (`waitForTimeout`). Use auto-retrying `expect`, and `page.clock` for timers and waits.
- A failing test that exposes an app bug: fix the bug. If the bug is too big for the current PR, mark the test `test.fixme` with a new roadmap ID instead.

## Keep docs/ up to date
After every change that adds, finishes or changes planned work, update the `docs/` folder in the same branch/PR:

- **`docs/PROGRESS.md`:**
  - Set the status of each roadmap item you worked on: ⬜ not started, 🟨 in progress, ✅ done, ⏸ on hold.
  - When an item is done, fill in the completion date and the PR link.
  - Update the totals line at the bottom.
  - Add a row to "Completed milestones" for each larger release.
- **`docs/ROADMAP.md`:**
  - Add any new next step or enhancement that comes up, using the next free ID in its group (e.g. `UX-12`), and add the matching row to PROGRESS.md.
  - Update an item's notes or priority when its scope changes.
  - Never reuse or renumber IDs; mark dropped items ⏸ in PROGRESS.md rather than deleting them.
- **`README.md`:** update it if the change affects setup, usage or the code layout.
