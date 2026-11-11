# Code Blocks

[![CI](https://github.com/vrund1999-ai/code_blocks/actions/workflows/ci.yml/badge.svg)](https://github.com/vrund1999-ai/code_blocks/actions/workflows/ci.yml)

Build apps without writing code. Lay out your screens by dragging elements, make them do things by connecting blocks with arrows, and press **▶ Run** to use your app straight away.

## Getting started

```bash
npm install
npm run dev        # open http://localhost:5173
npm test           # unit tests (engine + project store)
npm run build      # type-check + production build
```

Use Node 24 (see `.nvmrc`).

## Testing

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (Vitest) for the engine and project store, in `src/**/*.test.ts` |
| `npm run test:coverage` | Unit tests with a coverage report in `coverage/` |
| `npm run e2e:install` | One-time: download the Chromium build Playwright uses (`e2e:install:all` adds Firefox and WebKit) |
| `npm run test:e2e` | Browser end-to-end tests (Playwright, Chromium) in `e2e/` |
| `npm run test:e2e:ui` | The same tests in Playwright's interactive UI mode |
| `npm run test:e2e:all` | End-to-end tests in Chromium, Firefox and WebKit |
| `npm run check` | Type-check (app + tests), unit tests and production build |

The end-to-end tests start a dev server on port 4173 by themselves (or reuse one that is already running). After a failure, `npx playwright show-report` opens the report with screenshots and traces.

How the end-to-end tests are organised:

- **`e2e/support/fixtures.ts`:**
  - Every test fails if the page logs a console error.
  - `seed()` stores a project in localStorage before the app starts.
- **`e2e/support/projects.ts`:** builds test projects with the app's own model code.
- **`e2e/support/AppPage.ts`:** a page object with helpers for dragging, connecting blocks, running the app and so on.
- **No fixed waits:** use Playwright's auto-retrying `expect`, and use `page.clock` for anything timed.

**CI:** GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`. It has two jobs:

- type-check, unit tests with coverage, and the build
- end-to-end tests in Chromium, against the production build

The Playwright report and coverage are uploaded as artifacts. To also run Firefox and WebKit, start the workflow by hand with **all_browsers**.

## How it works

- **🎨 Design tab:** drag Boxes, Text, Buttons, Text Boxes, Checkboxes, Images and Lists onto a screen. Click any element to change it in the Settings panel. Use 🔗 *link* to tie a setting to a variable, so it updates live.
  - Drop elements inside a **List** to design a card that repeats for every item. Inside a card, 🔗 *link* can show *a field of this card's item*, such as a contact's name.
- **⚡ Logic tab:** a node graph.
  - **When…** blocks start things, for example *When button clicked*.
  - White arrows decide what happens next: **Do…** blocks, and **Decide & repeat** blocks such as *If*, *Repeat* and *For each*.
  - Coloured dotted wires carry **Values** into blocks, such as text, numbers, maths and comparisons.
  - **Records** group values under named fields, like a contact card (`name: Ada, age: 36`). Build one with *Make record*, then read it with *Get field*. Records can be kept in a variable or added to a list.
  - Wires only connect where they make sense.
- **▶ Run:** the app becomes live, both on the design canvas and in the preview beside the graph. Each block glows as it runs. A block that isn't set up properly is outlined in red, and the toolbar shows *show me*, which takes you to it.
- Projects are saved automatically in your browser. Use **Projects** to start from a template (Hello Name, Counter, To-do List) and **Export / Import** to move projects around as `.json` files.

## Code layout

| Path | What's there |
| --- | --- |
| `src/model/` | Project JSON types, element definitions, Zustand store (undo/redo), persistence |
| `src/engine/` | **Pure TypeScript** interpreter and block registry (`nodes/*.ts`), with no React or DOM |
| `src/runtime/` | Browser host for the engine (`controller.ts`), live state, and the element `Renderer` |
| `src/designer/` | Drag-and-drop design canvas (dnd-kit) |
| `src/logic/` | Node-graph editor (React Flow) |
| `src/app/` | Shell: toolbar, inspector, side panels |
| `src/templates/` | Starter projects |
| `e2e/` | Playwright end-to-end tests and their helpers (`e2e/support/`) |
| `.github/` | CI workflow and Dependabot config |

### Adding a block
Add a `NodeDef` to one of `src/engine/nodes/*.ts`. It declares pins, settings, a plain-English `sentence`, an optional `validate`, and `execute` (for actions and flow) or `evaluate` (for values). The palette, the block UI, connection checking and the inspector all pick it up automatically. If a block's inputs depend on its settings (like the fields of *Make record*), declare them with `dynamicInputs(config)`.

## Roadmap
All the planned next steps are listed in [docs/ROADMAP.md](docs/ROADMAP.md), and their completion is tracked in [docs/PROGRESS.md](docs/PROGRESS.md).
