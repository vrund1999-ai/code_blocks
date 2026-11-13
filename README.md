# Code Blocks

[![CI](https://github.com/vrund1999-ai/code_blocks/actions/workflows/ci.yml/badge.svg)](https://github.com/vrund1999-ai/code_blocks/actions/workflows/ci.yml)

Build apps without writing code. Lay out your screens by dragging elements, make them do things by connecting blocks with arrows, and press **▶ Run** to use your app straight away.

## Getting started

```bash
npm install
npm run dev        # open http://localhost:5173
npm run dev:server # server runtime at http://127.0.0.1:8787/api (table rows, deployed workflows)
npm test           # unit tests (engine, editor, server)
npm run build      # production build of the editor (apps/editor/dist)
```

Use Node 24 (see `.nvmrc`). The repo is an npm workspace: run every command from the root, and `npm install` links the packages together.

## Testing

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (Vitest) for the engine, the editor and the server, next to the code (`packages/*/src/**/*.test.ts`, `apps/*/src/**/*.test.ts`) |
| `npm run test:coverage` | Unit tests with a coverage report in `coverage/` |
| `npm run e2e:install` | One-time: download the Chromium build Playwright uses (`e2e:install:all` adds Firefox and WebKit) |
| `npm run test:e2e` | Browser end-to-end tests (Playwright, Chromium) in `e2e/` |
| `npm run test:e2e:ui` | The same tests in Playwright's interactive UI mode |
| `npm run test:e2e:all` | End-to-end tests in Chromium, Firefox and WebKit |
| `npm run check` | Type-check (engine, editor and tests), unit tests and production build |

The end-to-end tests start a dev server on port 4173 and the server runtime on port 8787 (with its database in memory) by themselves, or reuse ones that are already running. A running `npm run dev:server` is reused too, so stop it if it is older than your code. After a failure, `npx playwright show-report` opens the report with screenshots and traces.

How the end-to-end tests are organised:

- **`e2e/support/fixtures.ts`:**
  - Every test fails if the page logs a console error.
  - `seed()` stores a project in localStorage before the app starts.
- **`e2e/support/projects.ts`:** builds test projects with the app's own model code.
- **`e2e/support/api.ts`:** `fakeApi()` answers web requests from a fake API, so tests never use the real internet.
- **`e2e/support/AppPage.ts`:** a page object with helpers for dragging, connecting blocks, running the app and so on.
- **No fixed waits:** use Playwright's auto-retrying `expect`, and use `page.clock` for anything timed.
- **Clicks right after a drag:** for 50 ms after a drop, dnd-kit ignores clicks, and tests can click that fast. Use a helper that retries until the click has an effect, such as `linkSetting()`.

**CI:** GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`. It has two jobs:

- type-check, unit tests with coverage, and the build
- end-to-end tests in Chromium, against the production build

The Playwright report and coverage are uploaded as artifacts. To also run Firefox and WebKit, start the workflow by hand with **all_browsers**.

## How it works

- **🎨 Design tab:** drag Boxes, Text, Buttons, Text Boxes, Checkboxes, Dropdowns, Images and Lists onto a screen. Click any element to change it in the Settings panel. Use 🔗 *link* to tie a setting to a variable, so it updates live. The *Style* section sets an element's size, space around it, rounded corners, shadow and font.
  - The **Layers** panel shows the screen as a tree. Click a row to select an element, even one deep inside boxes, and double-click to rename it.
  - Drop elements inside a **List** to design a card that repeats for every item. Inside a card, 🔗 *link* can show *a field of this card's item*, such as a contact's name.
- **⚡ Logic tab:** a node graph.
  - **When…** blocks start things, for example *When button clicked*.
  - White arrows decide what happens next: **Do…** blocks, and **Decide & repeat** blocks such as *If*, *Repeat* and *For each*.
  - Coloured dotted wires carry **Values** into blocks, such as numbers, maths and comparisons.
  - **Text** blocks change, search, replace and split text. **Lists & records** blocks find, sort, filter and join list items. For a list of records, they can work on one field, such as sorting people by `age`.
  - **Records** group values under named fields, like a contact card (`name: Ada, age: 36`). Build one with *Make record*, then read it with *Get field*. Records can be kept in a variable or added to a list.
  - **Tables** blocks read and change the rows of your data tables: *Get rows* (all of them, or where a column has a value), *Add row* (from a record), *Update row* and *Delete row* (by row id). Rows come out as records, such as `id: 1, Name: Ada`.
  - **On the server** blocks run on the server once the project is deployed, even with the editor closed: *When web address is called* (another website or app calls `/api/hooks/<project id>/<name>`), *When form is sent* (the app's *Send form to server* block sends a record, such as what was typed into a form), and *On a schedule* (every few minutes or hours, or every day at a time). *Reply* answers a web address or form. Select one of their blocks and use **Try it** (or **Run now** for a schedule) to run it once on the server with sample data, without deploying; the reply shows in the settings and the blocks that ran in the Run log.
  - *Fetch from API* loads data from the web. Its JSON answer becomes records and lists, and *Pick field* (such as `current.temp`) takes one value out of it. *If it fails* runs when the server answers with an error or can't be reached.
  - Wires only connect where they make sense. Drag a wire out of a pin and let go on empty space to pick from the blocks that fit it; the one you pick is added already connected.
- **▦ Data tab:** design your app's **tables**, like the header row of a spreadsheet. Add a table (such as *Contacts*), then add *Text*, *Number* and *Yes / No* columns, rename them, reorder them and remove them. Every row also gets an automatic `id`. Under the columns, add, edit and delete the table's **rows**. Tables are saved with the project; rows are kept by the server (`npm run dev:server`) in a SQLite database.
- **▶ Run:** the app becomes live, both on the design canvas and in the preview beside the graph. Each block glows as it runs, and each value wire shows the last value that passed through it (point at it to see the whole value). The **Run log** under the preview lists every block that ran, with the values it used; click a line to jump to its block. A block that isn't set up properly is outlined in red, and the toolbar shows *show me*, which takes you to it.
- **☁ Server:** *Deploy* sends the project to the server, which runs its *On the server* workflows from that copy. The button shows *Live*, or *Changes not deployed* after you edit; deploy again to update the server, or *Stop workflows* to take the project off it. The menu lists the project's web addresses (with a copy button), forms and schedules, and its latest runs with their errors and messages.
- **Copy and paste:** Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste the selected element or blocks, and Ctrl+D duplicates them (⌘ on a Mac). Select several blocks with Ctrl+click or a Shift+drag box; their copies keep the wires between them. Ctrl+Z / Ctrl+Y undo and redo.
- Projects are saved automatically in your browser. Use **Projects** to start from a template (Hello Name, Counter, To-do List) and **Export / Import** to move projects around as `.json` files.

## Code layout

The repo is an npm workspace with two packages:

- **`packages/engine`** (`@code-blocks/engine`): runs logic graphs. It is plain TypeScript with no React, DOM or Node code; its `tsconfig.json` leaves those types out to keep it that way. That lets the same engine run in the editor and, later, on a server. Import its files by path, such as `@code-blocks/engine/registry`.
- **`apps/editor`** (`@code-blocks/editor`): the React app you build apps in.
- **`apps/server`** (`@code-blocks/server`): runs graphs on a server with the same engine (Hono on Node). `POST /api/run` runs one event block of a graph sent with the request and returns the blocks that ran, the final variable values, messages and any error. Blocks that change or read the screen stop with a friendly message there. It also keeps the rows of data tables, deployed projects and saved values in SQLite (`apps/server/data/code-blocks.db`; set `DB_FILE` to change it), and runs the workflows of deployed projects: web addresses, forms and schedules. In development the editor forwards `/api` to it.

| Path | What's there |
| --- | --- |
| `packages/engine/src/` | Interpreter, graph types (`graph.ts`), data table types and row/record conversion (`tables.ts`), value conversions, block registry (`nodes/*.ts`) and the value previews used by live wires and the run log |
| `apps/editor/src/model/` | Project JSON types, element definitions, Zustand store (undo/redo, copy and paste), persistence |
| `apps/editor/src/runtime/` | Browser host for the engine (`controller.ts`), live state, run log, and the element `Renderer` |
| `apps/editor/src/designer/` | Drag-and-drop design canvas (dnd-kit), element palette, layers panel |
| `apps/editor/src/logic/` | Node-graph editor (React Flow), live wire values, run log panel |
| `apps/editor/src/app/` | Shell: toolbar, inspector, side panels, the Data tab (`DataView.tsx`), the ☁ Server menu (`ServerMenu.tsx`), *Try it* for server blocks (`TryPanel.tsx`) |
| `apps/editor/src/data/` | Server calls: table rows (`rowsApi.ts`), deploying and forms (`serverApi.ts`, `deployStore.ts`), trying server workflows (`tryApi.ts`) |
| `apps/editor/src/templates/` | Starter projects |
| `apps/server/src/` | Server routes (`app.ts`, `rowRoutes.ts`, `workflowRoutes.ts`), the SQLite database (`db.ts`) with table rows (`rows.ts`), deployed projects (`deployments.ts`) and saved values (`store.ts`), workflow triggers and schedules (`workflows.ts`), server host for the engine (`host.ts`), runs (`run.ts`) and request checks (`validate.ts`) |
| `e2e/` | Playwright end-to-end tests of the editor, and their helpers (`e2e/support/`) |
| `tsconfig.base.json`, `vitest.config.ts`, `playwright.config.ts` | Settings shared by the whole repo |
| `.github/` | CI workflow and Dependabot config |

### Adding a block
Add a `NodeDef` to one of `packages/engine/src/nodes/*.ts`. It declares pins, settings, a plain-English `sentence`, an optional `validate`, and `execute` (for actions and flow) or `evaluate` (for values). The palette, the block UI, connection checking and the inspector all pick it up automatically. If a block's inputs depend on its settings (like the fields of *Make record*), declare them with `dynamicInputs(config)`. Blocks reach the outside world only through `HostApi` (for example `httpRequest` for web requests), which `apps/editor/src/runtime/controller.ts` implements for the browser and `apps/server/src/host.ts` for the server.

## Roadmap
All the planned next steps are listed in [docs/ROADMAP.md](docs/ROADMAP.md), and their completion is tracked in [docs/PROGRESS.md](docs/PROGRESS.md).
