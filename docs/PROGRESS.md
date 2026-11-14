# Code Blocks — Progress

This file tracks completion of the items in [ROADMAP.md](ROADMAP.md).

**Status key:** ⬜ Not started · 🟨 In progress · ✅ Done · ⏸ On hold

**How to update:** change an item's status, and when it is done, fill in the date and the PR. Add new items to ROADMAP.md first, then add them here with the same ID.

---

## Completed milestones

| Milestone | Date | PR | Summary |
| --- | --- | --- | --- |
| v1: local prototype | 2026-11-10 | [#1](https://github.com/vrund1999-ai/code_blocks/pull/1) | See below |
| Testing and CI | 2026-11-10 | [#2](https://github.com/vrund1999-ai/code_blocks/pull/2) | See below |
| Records | 2026-11-10 | [#4](https://github.com/vrund1999-ai/code_blocks/pull/4) | See below |
| List cards | 2026-11-10 | [#5](https://github.com/vrund1999-ai/code_blocks/pull/5) | See below |
| Fetch from API | 2026-11-11 | [#6](https://github.com/vrund1999-ai/code_blocks/pull/6) | See below |
| Text and list blocks | 2026-11-11 | [#7](https://github.com/vrund1999-ai/code_blocks/pull/7) | See below |
| Wire suggestions | 2026-11-11 | [#9](https://github.com/vrund1999-ai/code_blocks/pull/9) | See below |
| Copy and paste | 2026-11-11 | [#10](https://github.com/vrund1999-ai/code_blocks/pull/10) | See below |
| Layers panel | 2026-11-11 | [#12](https://github.com/vrund1999-ai/code_blocks/pull/12) | See below |
| Dropdown | 2026-11-11 | [#13](https://github.com/vrund1999-ai/code_blocks/pull/13) | See below |
| Styling | 2026-11-12 | [#14](https://github.com/vrund1999-ai/code_blocks/pull/14) | See below |
| Live values on wires | 2026-11-12 | [#15](https://github.com/vrund1999-ai/code_blocks/pull/15) | See below |
| Run log | 2026-11-12 | [#16](https://github.com/vrund1999-ai/code_blocks/pull/16) | See below |
| Monorepo split | 2026-11-13 | [#17](https://github.com/vrund1999-ai/code_blocks/pull/17) | See below |
| Server runtime | 2026-11-13 | [#18](https://github.com/vrund1999-ai/code_blocks/pull/18) | See below |
| Data tables | 2026-11-13 | [#20](https://github.com/vrund1999-ai/code_blocks/pull/20) | See below |
| Table rows | 2026-11-13 | [#21](https://github.com/vrund1999-ai/code_blocks/pull/21) | See below |
| Table blocks | 2026-11-13 | [#22](https://github.com/vrund1999-ai/code_blocks/pull/22) | See below |
| Server workflows | 2026-11-13 | [#23](https://github.com/vrund1999-ai/code_blocks/pull/23) | See below |
| Try server workflows | 2026-11-13 | [#26](https://github.com/vrund1999-ai/code_blocks/pull/26) | See below |
| Secrets | 2026-11-13 | [#27](https://github.com/vrund1999-ai/code_blocks/pull/27) | See below |
| Fetch through the server | 2026-11-13 | [#28](https://github.com/vrund1999-ai/code_blocks/pull/28) | See below |
| Project file checks | 2026-11-13 | [#29](https://github.com/vrund1999-ai/code_blocks/pull/29) | See below |
| Accounts | 2026-11-13 | [#30](https://github.com/vrund1999-ai/code_blocks/pull/30) | See below |
| Projects on your account | 2026-11-13 | [#31](https://github.com/vrund1999-ai/code_blocks/pull/31) | See below |
| Publish apps | 2026-11-14 | [#32](https://github.com/vrund1999-ai/code_blocks/pull/32) | See below |

v1 included:
- **Design tab:** drag-and-drop UI designer, inspector, and binding element settings to variables.
- **Logic tab:** node graph with typed connections and a live preview.
- **Run mode:** blocks light up as they run; broken blocks are highlighted.
- **Engine:** pure TypeScript interpreter behind `HostApi`.
- **Blocks:** 5 events, 12 actions, 3 flow blocks and 13 value blocks.
- **Projects:** autosave, projects menu, export/import, undo/redo, and 3 templates.
- **Tests:** 20 unit tests, plus a manual browser end-to-end run.

Testing and CI included:
- **End-to-end suite:** 68 Playwright tests in `e2e/` covering every v1 feature.
- **CI:** a GitHub Actions workflow that runs the type-check, the unit tests with coverage, the build and the end-to-end tests.
- **Bug fix:** on the design canvas, an element now drops exactly where the drop indicator shows. Before, a drop inside a box could land after it instead.

Records included:
- **Record value type:** values with named fields, such as `name: Ada, age: 36`. They have their own purple pins and wires, and can be wired only into record, "any" or text inputs.
- **Record variables:** set their starting fields in the Variables panel.
- **Blocks:** *Make record* (one input per field, added and renamed on the block), *Get field*, *Change field* and *Set field of variable*. Lists of records work with the existing list blocks and *For each*.
- **Engine:** blocks can now have input pins that depend on their settings (`dynamicInputs`). Removing a field also removes its wire.
- **Tests:** 17 new unit tests and 8 new end-to-end tests.

List cards included:
- **Card templates:** drop Text, Images, Buttons and Boxes into a List to design a card. The card repeats for every item. Without elements inside, a List still shows one line per item.
- **Item fields:** inside a card, any linkable setting can show a field of the card's item (*A field of this card's item*). The designer previews the first starting item, or shows the field name, like `‹name›`.
- **Card buttons:** *When button clicked* gets *List item* and *Position* pins when its button is inside a card.
- **Rules:** text boxes, checkboxes and lists can't go in cards, because they keep one value per element.
- **Tests:** 8 new unit tests and 7 new end-to-end tests.

Fetch from API included:
- **Block:** *Fetch from API* loads data from a web address with Get, Post, Put, Patch or Delete. JSON answers become records and lists, so a list of results can go straight into a List's cards.
- **Pick field:** a dotted path such as `current.temp` or `results.1.name` picks one value out of the answer.
- **Sending:** the *Send* input appears for requests that send something. Records and lists are sent as JSON. *Headers* takes a record.
- **Failures:** the *If it fails* branch runs on error answers and unreachable servers, with the *Problem* and *Status code*. Without that branch, the failure shows on the block like any other error.
- **Engine:** `HostApi.httpRequest`, so a server host can make the same requests later.
- **Tests:** 13 new unit tests and 5 new end-to-end tests, which answer requests from a fake API.

Text and list blocks included:
- **Text blocks:** *Change text* (UPPERCASE, lowercase, Capital For Each Word, remove spaces at the ends), *Text contains* (also starts with / ends with, ignoring capitals unless asked), *Text length*, *Replace text* and *Split text*.
- **List blocks:** *Find in list*, *Sort list*, *Filter list* and *Join list into text*. For lists of records, a *Field* input picks which field to look at, such as sorting people by `age`.
- **List actions:** *Insert into list* and *Change item in list*, which change a list variable at a position.
- **Palette:** *Values* is split into **Text** and **Lists & records** groups, each with its own colour.
- **Engine:** *Compare* and *Filter list* share the same checks. Sorting puts numbers in size order and text A → Z, ignoring capitals.
- **Tests:** 17 new unit tests and 6 new end-to-end tests, including a search box that filters List cards.

Wire suggestions included:
- **Logic tab:** drag a wire out of a pin and let go on empty space, and a menu shows the blocks that fit it, grouped like the palette, with a search box. From an output it offers what can come next or use the value; from an input, what can lead there or give the value.
- **Wiring:** the picked block appears next to the drop point already wired, on the pin whose type matches best (the same type, then “any”, then one that converts). Adding it is one undo step.
- **Keyboard:** the search box has focus, Enter adds the first match and Escape closes the menu.
- **Tests:** 7 new unit tests and 4 new end-to-end tests.

Copy and paste included:
- **Shortcuts:** Ctrl+C, Ctrl+X, Ctrl+V and Ctrl+D (⌘ on a Mac) copy, cut, paste and duplicate the selected element in the Design tab, or the selected blocks in the Logic tab. Both Settings panels have a **Duplicate** button. Typing in a field still copies and pastes text as usual.
- **Elements:** a copy goes right after the selected element, with everything inside it. Copies get new names that count up ("Button 1" → "Button 2"). Text boxes, checkboxes and lists, which can't be in a List's cards, are pasted onto the screen instead.
- **Blocks:** select several with Ctrl+click or a Shift+drag box. Copies keep the wires between them and land a little further along each time.
- **Between projects:** what you copied is kept when you open another project. Settings that point at an element, variable or screen the other project doesn't have are cleared.
- **Tests:** 11 new unit tests and 7 new end-to-end tests.

Layers panel included:
- **Design tab:** a **Layers** panel in the sidebar shows the open screen as a tree. Click a row to select its element, even one deep inside boxes or a List's card. Elements in a card are shown in italics, and a List is marked *card for each item*.
- **Finding things:** pointing at a row outlines its element on the canvas. Selecting an element on the canvas highlights its row and opens the rows around it.
- **Editing:** double-click a row (or press F2) to rename its element; Enter saves and Escape cancels. Delete, copy and paste work on the selected row like on the canvas.
- **Keyboard:** ↑ and ↓ move through the rows. → opens a row or goes into it, and ← closes it or goes up to the row around it.
- **Tests:** 3 new unit tests and 5 new end-to-end tests.

Dropdown included:
- **Element:** a **Dropdown** in the Elements palette lets people pick one choice. Type the choices one per line, or 🔗 link a list variable; for a list of records, *Field to show* picks which field. It also has hint text and a starting choice.
- **Logic:** *When value changes*, *Get text box value* and *Set text box value* work with dropdowns, and the Settings panel offers *When a choice is picked…*.
- **Rules:** like text boxes, dropdowns can't go in a List's cards. A choice set by logic that isn't in the list still shows, so what you see is what blocks read.
- **Settings panel:** text areas grow with their lines, up to 6.
- **Tests:** 3 new unit tests and 3 new end-to-end tests.

Styling included:
- **Settings panel:** every element has a **Style** section with *Width*, *Height*, *Space around* (margin), *Rounded corners*, *Shadow* (none to strong) and *Font*. Sizes are in pixels; an empty box keeps the usual size.
- **Fonts:** a font set on a Box applies to everything inside it. The screen itself only offers a font, which the whole screen uses.
- **Layout:** an element with a width set keeps that width in a side-by-side Box, in the designer and when running. An Image's width is now this shared setting.
- **Older projects** load unchanged: elements without the new settings keep their usual look.
- **Tests:** 6 new unit tests and 3 new end-to-end tests.

Live values on wires included:
- **Logic tab:** while the app runs, each data wire shows the last value that passed through it in a small label, which pulses when a new value passes. Text shows in quotes, yes / no for true and false, and lists and records are summed up ("list of 3 items", "{name, city}"). Point at a label to see the whole value. Stop clears them.
- **Readable at any zoom:** labels keep their size when the canvas is zoomed out, and sit above the blocks.
- **Engine:** the interpreter reports each value read through a wire (`onValue`); the app stores them at most every 50 ms, so loops stay fast.
- **Tests:** 4 new unit tests and 2 new end-to-end tests.

Run log included:
- **Logic tab:** a **Run log** under the preview lists every block that ran, newest last. Each event (a click, a typed value…) starts a group with its time and what it carried, such as *New value: “Bo”*. Each block shows its sentence and the inputs it used, such as *Text: “Hello, Ada”*. Errors show in red.
- Click a line to select its block and bring it into view. The log stays after Stop and clears when the app runs again, or with *Clear*. It keeps the newest 500 lines, so long loops stay fast.
- **Engine:** the interpreter reports event data (`onNodeRun`) and the inputs a running block reads (`onInput`).
- **Tests:** 7 new unit tests and 2 new end-to-end tests.

Monorepo split included:
- **Layout:** the repo is an npm workspace. The engine is its own package, `packages/engine` (`@code-blocks/engine`), and the editor moved to `apps/editor`. File history is kept (`git mv`). `apps/server` comes with BE-2.
- **Engine boundary:** the graph types (`GraphNode`, `GraphEdge`, `LogicGraph`, `ValueType`, `ElementType`) moved into the engine, which no longer imports anything from the editor. Its type-check leaves out the DOM and Node types, so browser- or server-only code there fails `npm run typecheck`.
- **Unchanged:** every command still runs from the root, and the app works the same.

Server runtime included:
- **`apps/server`** (`@code-blocks/server`): a small [Hono](https://hono.dev) server on Node that runs graphs with the same engine as the editor. Start it with `npm run dev:server`; it listens on `http://127.0.0.1:8787/api`, and the editor's dev server forwards `/api` to it.
- **`POST /api/run`:** runs one event block of a graph sent with the request (plus its variables and what the event carries) and returns the blocks that ran with their inputs, the variables at the end, any messages, and the error if a block stopped the run. `GET /api/health` answers `{ ok: true }`.
- **Server host:** variables, *Show message* (collected), *Wait*, *Save/Load from device* (kept per project, in memory until BE-3 picks a database) and *Fetch from API* work on the server. Blocks that change or read the screen, and *Go to screen*, stop with a friendly message on that block.
- **Limits:** a run may take 10 seconds, requests may be 1 MB, and the log keeps the newest 500 steps.
- **Engine:** a host can throw `HostError` to show its own message on the block that called it; other errors are now pinned on the block that hit them too. `coerceTo` (variable type conversion) moved into the engine, shared by both hosts.
- **Tests:** 20 new unit tests (1 engine, 19 server). Nothing on screen changed.

Data tables included:
- **▦ Data tab:** a third tab beside Design and Logic. Add tables (such as *Contacts* or *Orders*), name them, and design their columns like the header row of a spreadsheet: add *Text*, *Number* and *Yes / No* columns, rename them, change their kind, move them left or right, and remove them. Every row also gets an automatic **id** number.
- **Friendly checks:** a column with no name, a name another column already has (ignoring case and spaces), or the name `id` is outlined in red with a message. So are two tables with the same name.
- **Saved in the project:** tables are part of the project file, so autosave, undo/redo, export and import cover them. Projects saved before tables open with none. Rows will live on the server in SQLite (BE-4, BE-5).
- **Engine:** the table types (`DataTable`, `TableColumn`) and the name checks live in `packages/engine/src/tables.ts`, so the server can use them for BE-5.
- **Fix:** pasting only works in the tab that matches what was copied, so blocks can't be pasted while the Data tab is open.
- **Tests:** 7 new unit tests and 3 new end-to-end tests.

Table rows included:
- **Rows in the Data tab:** under each table's columns, a grid of its rows. **+ Add row** adds one with the next id; click a cell to edit it (text and numbers save on Enter or when you leave the cell, Escape gives up the edit; yes/no saves on click). Deleting a row asks first, right in the row. Large tables load 100 rows at a time, with *Show more*.
- **Kept by the server, in SQLite:** rows live in `apps/server/data/code-blocks.db` (`DB_FILE` changes it; `:memory:` keeps nothing). Each row stores its values by column id, so renaming a column keeps them; after a column changes kind, its values are shown in the new kind. Row ids are never reused.
- **Server routes:** `GET/POST /api/projects/:projectId/tables/:tableId/rows` and `PATCH/DELETE …/rows/:rowId`, with checks on ids, values (text up to 10,000 characters, numbers, yes/no, empty) and size (64 KB).
- **When the server isn't running,** the Data tab says so, with how to start it and *Try again*. Columns can still be designed. A change the server refuses is put back, with its message.
- **Tests:** 15 new unit tests and 3 new end-to-end tests. The end-to-end tests now start the server too, with its database in memory.

Table blocks included:
- **A new *Tables* group of blocks:** *Get rows* (every row, or the rows where a column has a value; gives the rows, how many and the first one), *Add row* (from a record, such as one from *Make record*; gives the new row and its id), *Update row* and *Delete row* (by row id; they say whether the row was found).
- **Rows are records** keyed by column name, plus `id`, so the list and record blocks work on them, and List cards can show a column with *a field of this card's item*. Fields are matched to columns ignoring case, and values are converted to each column's kind.
- **In the app and on the server:** the editor's host reaches the rows through the server's row routes; the server host reads them from SQLite directly. `POST /api/run` takes the project's `tables`.
- **Friendly errors:** a table that was deleted, a column that doesn't exist (*“Email” isn't a column of “Contacts”.*), no table picked, or the server not reachable, shown on the block.
- **Deleting a table** clears it from the blocks that used it (undo brings both back), and pasting blocks into another project clears a table it doesn't have.
- **Tests:** 10 new unit tests and 3 new end-to-end tests.

Server workflows included:
- **A new *On the server* group of blocks:** *When web address is called* (a name such as `orders`, and a method or *Any*; gives the data sent, the address values and the method), *When form is sent* (a form name; gives the values), *On a schedule* (every few minutes, every few hours, or every day at a time, by the server's clock), *Reply* (an answer and a status code), and *Send form to server* for the app (sends a record and gives back the reply).
- **Deploying:** the toolbar's *☁ Server* menu sends the project to the server, which keeps the copy in SQLite and runs its workflows from it, even after the editor is closed or the server restarts. The button says *Live* or *Changes not deployed*, and *Stop workflows* takes the project off the server. Server blocks with a settings problem are left out, with *show me*.
- **The menu lists** the web addresses (with a copy button), forms and schedules of the deployed copy, and the latest 20 runs with their errors and messages.
- **Server routes:** `GET/PUT/DELETE /api/projects/:projectId/deployment`, `GET …/runs`, `POST …/forms/:form`, and any method on `/api/hooks/:projectId/:path`. JSON and form posts become values; *Reply* sends text as text and other values as JSON.
- **Saved values on the server** (*Save to device* / *Load from device* in server workflows) are now kept in SQLite, so a schedule can remember things between runs.
- **Tests:** 25 new unit tests and 3 new end-to-end tests.

Try server workflows included:
- **A *Try it* section** in the settings of *When web address is called*, *When form is sent* and *On a schedule* (*Run now*). It runs the workflow as it is in the editor, once, on the server, without deploying it, and doesn't change the deployed copy.
- **Sample data:** address values and form values as `name: value` lines, and the data sent as text or JSON. The data box is hidden for GET addresses, and *Any* is tried as a GET, or as a POST when data is typed. Samples are kept while the editor is open.
- **The result:** the reply and its status code, messages, and errors with *show me*. The blocks that ran, with their values, go to the Run log (unless the app is running).
- **Server:** `POST /api/run` takes `replies: true` so *Reply* blocks answer.
- **Tests:** 8 new unit tests and 2 new end-to-end tests.

Secrets included:
- **☁ Server → Secrets:** add a secret (a name like `WEATHER_KEY` and a hidden value), replace its value, or delete it (asks once more). Only names and dates are listed, since the server never sends a value back.
- **The *Secret* block** (*On the server*) gives a secret's value in server workflows, for example in a *Fetch from API* address or header. In the app it stops with a message, so secrets never reach the browser. A missing secret says where to add it.
- **Hidden in results:** the values of secrets a run read show as ••• in replies, messages, errors, variables and the steps sent to the Run log.
- **Server:** secrets are kept per project in SQLite (names match ignoring case; values from 4 to 10,000 characters) through `GET /api/projects/:projectId/secrets` and `PUT` / `DELETE …/secrets/:name`.
- **Tests:** 13 new unit tests and 2 new end-to-end tests.

Fetch through the server included:
- **“Send from”** on *Fetch from API*: *The app* (as before) or *The server*, for APIs that don't let apps in a browser read their answers (CORS). The block then reads “… through the server”. When the app can't reach an address, the problem now suggests sending from the server.
- **Server:** `POST /api/fetch` sends the request (http and https only, up to 1 MB) and gives back the status and answer, or a plain reason when the address can't be reached, takes over 30 seconds, or answers with more than 5 MB. Server workflows share the same code, with the same limits.
- **Secrets stay out of it:** the proxy never fills in secrets, since anyone using the app could send them anywhere. To use an API key from the app, call a server workflow's web address, and use the *Secret* block there.
- **Tests:** 15 new unit tests and 2 new end-to-end tests.

Project file checks included:
- **One check for every project** (`packages/engine/src/project.ts`, with zod): imported files, projects saved in the browser, and the parts the server runs or deploys. It checks screens and their elements, settings, variables, tables, blocks and wires, that ids aren't repeated, and that each screen starts with a container.
- **Plain messages** that name the place of the first problem, such as “In screen “Home” → element “Intro”: “type” is “video”, which should be one of …”. Files that aren't projects at all say so.
- **Upgrades:** the format is now version 2. Older files are upgraded one version at a time (version 1 files without data tables get an empty list), and files from a newer Code Blocks say to update.
- **Saved projects that can't be opened** are left alone: the editor starts with a template and says why, and the Projects menu says why when you pick one.
- **Small repairs:** wires to blocks that aren't there are dropped, and blocks without a place or settings get the defaults.
- **Tests:** 14 new unit tests (including every template passing the check) and 3 new end-to-end tests.

Accounts included:
- **👤 in the toolbar:** create an account with an email and a password (at least 8 characters), sign in, and sign out. Signing in is optional: guests still build and run apps in the browser.
- **Server features need an account:** the ☁ Server menu, table rows in the Data tab, *Try it*, and requests sent from the server ask guests to sign in instead of failing.
- **Projects belong to accounts:** the first account that uses a project on the server owns it, and other accounts are refused (“This project belongs to another account.”). Web addresses and forms stay open, since they're how apps reach their workflows.
- **Server:** `POST /api/auth/signup`, `/signin`, `/signout` and `GET /api/auth/me`. Passwords are hashed with scrypt; sessions last 30 days in an HttpOnly, SameSite=Lax cookie, and only their hashes are stored. Requests that change things are refused when they come from other sites (CSRF).
- **Tests:** 10 new unit tests, 3 new end-to-end tests, and a `signedIn` option for end-to-end tests of the server features.

Projects on your account included:
- **Saved to the account:** signed in, the project you work on is saved to your account on the server, so it opens in any browser you sign in to. Guests' projects are still saved in the browser, and Export/Import still work.
- **Projects menu:** *On your account* lists the account's projects; *In this browser only* lists projects made before signing in, and opening one saves it to the account. Deleting an account project also stops its server workflows.
- **Save status** next to the project name: *Saved in this browser*, *☁ Saved to your account*, or a warning when it can't be saved there (server unreachable, or another account's project). Until then, the changes are kept in this browser and sent later.
- **Changed somewhere else:** each save says which version it was based on. When the project was changed in another tab or browser, the editor asks whether to open the newest copy or keep this one, instead of overwriting it.
- **Server:** `GET /api/projects`, and `GET`, `PUT` and `DELETE /api/projects/:projectId`. Saved projects are checked with the project file schema (QE-4), up to 2 MB.
- **Tests:** 10 new unit tests and 4 new end-to-end tests.

Publish apps included:
- **🔗 Publish** in the toolbar: puts a copy of the app on a link like `/app/k3x9q2…` that anyone can open, without the editor or an account. The button shows *Live*, or *Changes not published* after you edit; publishing again keeps the link. *Unpublish* takes it down.
- **The published app:** just the running app, centered on the page. It reads the rows of its tables, but can't add, change or delete them (only the owner can, in the Data tab). Forms and web addresses reach the deployed server workflows, as in the editor. Requests sent from the server aren't available to visitors yet.
- **Server:** `GET`, `PUT` and `DELETE /api/projects/:projectId/publication` for the owner, and `GET /api/published/:slug` and `GET /api/published/:slug/tables/:tableId/rows` for anyone. Links are 12 random letters and digits. Deleting a project also unpublishes it.
- **Toolbar:** stays on one line. With the new button it wrapped when the save status changed, which moved the canvas during block drags and made a Logic test flaky.
- **Tests:** 5 new unit tests and 2 new end-to-end tests.

---

## Roadmap status

### 1. Backend (phase 2)
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| BE-1 | Monorepo split | ✅ | 2026-11-13 | [#17](https://github.com/vrund1999-ai/code_blocks/pull/17) |
| BE-2 | Server runtime | ✅ | 2026-11-13 | [#18](https://github.com/vrund1999-ai/code_blocks/pull/18) |
| BE-3 | Data tables schema editor | ✅ | 2026-11-13 | [#20](https://github.com/vrund1999-ai/code_blocks/pull/20) |
| BE-4 | Table data viewer/editor | ✅ | 2026-11-13 | [#21](https://github.com/vrund1999-ai/code_blocks/pull/21) |
| BE-5 | Table blocks | ✅ | 2026-11-13 | [#22](https://github.com/vrund1999-ai/code_blocks/pull/22) |
| BE-6 | Server workflow triggers | ✅ | 2026-11-13 | [#23](https://github.com/vrund1999-ai/code_blocks/pull/23) |
| BE-7 | Fetch from API block | ✅ | 2026-11-11 | [#6](https://github.com/vrund1999-ai/code_blocks/pull/6) |
| BE-8 | Secrets store | ✅ | 2026-11-13 | [#27](https://github.com/vrund1999-ai/code_blocks/pull/27) |
| BE-9 | Send email block | ⬜ | | |
| BE-10 | Fetch through a server proxy | ✅ | 2026-11-13 | [#28](https://github.com/vrund1999-ai/code_blocks/pull/28) |
| BE-11 | Host the server runtime | ⬜ | | |
| BE-12 | Clean up rows of deleted tables and projects | ⬜ | | |
| BE-13 | Try server workflows without deploying | ✅ | 2026-11-13 | [#26](https://github.com/vrund1999-ai/code_blocks/pull/26) |

### 2. Platform
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| PL-1 | Accounts and sign-in | ✅ | 2026-11-13 | [#30](https://github.com/vrund1999-ai/code_blocks/pull/30) |
| PL-2 | Cloud project storage | ✅ | 2026-11-13 | [#31](https://github.com/vrund1999-ai/code_blocks/pull/31) |
| PL-3 | Publish to a URL | ✅ | 2026-11-14 | [#32](https://github.com/vrund1999-ai/code_blocks/pull/32) |
| PL-4 | Sharing / collaboration | ⬜ | | |
| PL-5 | Version history | ⬜ | | |
| PL-6 | Project gallery | ⬜ | | |
| PL-7 | Password reset and account settings | ⬜ | | |
| PL-8 | Visitor access for published apps | ⬜ | | |

### 3. Editor UX
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| UX-1 | Copy / paste / duplicate | ✅ | 2026-11-11 | [#10](https://github.com/vrund1999-ai/code_blocks/pull/10) |
| UX-2 | Layers panel | ✅ | 2026-11-11 | [#12](https://github.com/vrund1999-ai/code_blocks/pull/12) |
| UX-3 | Wire-to-empty-space block suggestions | ✅ | 2026-11-11 | [#9](https://github.com/vrund1999-ai/code_blocks/pull/9) |
| UX-4 | Context menus | ⬜ | | |
| UX-5 | Multi-select in design | ⬜ | | |
| UX-6 | Graph comments / groups | ⬜ | | |
| UX-7 | Auto-arrange graph | ⬜ | | |
| UX-8 | "Where is this used?" | ⬜ | | |
| UX-9 | Onboarding tutorial | ⬜ | | |
| UX-10 | Resizable preview | ⬜ | | |
| UX-11 | Touch support | ⬜ | | |
| UX-12 | Projects menu click-outside | ⬜ | | |
| UX-13 | Item-linked settings outside a List | ⬜ | | |
| UX-14 | Drag to reorder in the layers panel | ⬜ | | |

### 4. UI elements and styling
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| EL-1 | Dropdown | ✅ | 2026-11-11 | [#13](https://github.com/vrund1999-ai/code_blocks/pull/13) |
| EL-2 | List item templates (cards) | ✅ | 2026-11-10 | [#5](https://github.com/vrund1999-ai/code_blocks/pull/5) |
| EL-3 | Number input / slider | ⬜ | | |
| EL-4 | Grid / columns layout | ⬜ | | |
| EL-5 | Link, divider, spacer | ⬜ | | |
| EL-6 | Date picker | ⬜ | | |
| EL-7 | Icon | ⬜ | | |
| EL-8 | More styling options | ✅ | 2026-11-12 | [#14](https://github.com/vrund1999-ai/code_blocks/pull/14) |
| EL-9 | Themes | ⬜ | | |
| EL-10 | Fill / % sizes and style blocks | ⬜ | | |

### 5. Logic blocks
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| LB-1 | Text blocks | ✅ | 2026-11-11 | [#7](https://github.com/vrund1999-ai/code_blocks/pull/7) |
| LB-2 | List blocks | ✅ | 2026-11-11 | [#7](https://github.com/vrund1999-ai/code_blocks/pull/7) |
| LB-3 | Records value type | ✅ | 2026-11-10 | [#4](https://github.com/vrund1999-ai/code_blocks/pull/4) |
| LB-4 | Math extras | ⬜ | | |
| LB-5 | Date and time blocks | ⬜ | | |
| LB-6 | Custom reusable blocks | ⬜ | | |
| LB-7 | Local variables | ⬜ | | |
| LB-8 | Repeat while / stop loop | ⬜ | | |
| LB-9 | More events | ⬜ | | |
| LB-10 | Typed starting values for lists and records | ⬜ | | |

### 6. Run mode and debugging
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| RT-1 | Live values on wires | ✅ | 2026-11-12 | [#15](https://github.com/vrund1999-ai/code_blocks/pull/15) |
| RT-2 | Run log panel | ✅ | 2026-11-12 | [#16](https://github.com/vrund1999-ai/code_blocks/pull/16) |
| RT-3 | Step-through debugger | ⬜ | | |
| RT-4 | Cancel waits on Stop | ⬜ | | |
| RT-5 | Navigation history / Go back | ⬜ | | |
| RT-6 | Run details for server workflow runs | ⬜ | | |

### 7. AI assistance
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| AI-1 | Describe → generate app | ⬜ | | |
| AI-2 | Explain this logic | ⬜ | | |
| AI-3 | Suggested fixes | ⬜ | | |

### 8. Quality and engineering
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| QE-1 | E2E tests in repo | ✅ | 2026-11-10 | [#2](https://github.com/vrund1999-ai/code_blocks/pull/2) |
| QE-2 | CI workflow | ✅ | 2026-11-10 | [#2](https://github.com/vrund1999-ai/code_blocks/pull/2) |
| QE-3 | Code-split bundle | ⬜ | | |
| QE-4 | Project format validation | ✅ | 2026-11-13 | [#29](https://github.com/vrund1999-ai/code_blocks/pull/29) |
| QE-5 | Accessibility pass | ⬜ | | |
| QE-6 | Large-graph performance | ⬜ | | |
| QE-7 | Export as standalone app / code | ⬜ | | |
| QE-8 | Visual regression screenshots | ⬜ | | |
| QE-9 | Raise unit test coverage | ⬜ | | |
| QE-10 | React Flow attribution review | ✅ | 2026-11-13 | [#25](https://github.com/vrund1999-ai/code_blocks/pull/25) |
| QE-11 | Drag tests in Firefox / WebKit | ⬜ | | |

---

**Totals:** 28 / 75 done · 0 in progress
