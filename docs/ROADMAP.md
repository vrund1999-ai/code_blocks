# Code Blocks — Roadmap

This file lists all the planned next steps and enhancements. Each item has an ID such as `BE-1`, and its status is tracked in [PROGRESS.md](PROGRESS.md).

Priority: **P1** comes next, **P2** is important but can wait, and **P3** is nice to have.

## Next up
All of the first P1 wave (v1 follow-ups, data tables and server workflows) is done. This is the order for the second wave:

1. ✅ **QE-10:** show React Flow's attribution again. A small fix, and React Flow asks that only Pro subscribers hide it.
2. ✅ **BE-13:** try server workflows without deploying, to finish the server workflow work from BE-6.
3. ✅ **BE-8**, then ✅ **BE-10:** a secrets store, and *Fetch from API* through the server, so API keys never reach the browser.
4. ✅ **QE-4:** validate the project file format. The server will soon store whole projects (PL-2), so it has to check them first.
5. ✅ **PL-1**, ✅ **PL-2** and ✅ **PL-3:** sign-in, projects saved on the server, and apps published to a shareable address.
6. ✅ **BE-11:** the server is ready to host: it serves the editor, limits sign-ins and requests, keeps requests off its own network, and encrypts secrets.

The third wave puts first what matters once real people sign up and visitors open published apps:

1. ✅ **QE-12:** signing out waits for saves, so the last change before signing out isn't lost.
2. ✅ **QE-3:** the bundle is split, so published apps don't load the editor, and the editor loads the Logic tab on its own.
3. ✅ **PL-8:** visitors can add rows to published apps (sign-up lists, guestbooks), as each table allows. Requests sent from the server for visitors moved to **PL-9**.
4. ✅ **PL-7:** password reset by email (SMTP), and account settings. **BE-9** (*Send email*) can use the same mailer.
5. ✅ **QE-5:** an accessibility pass, for the editor and published apps. Connecting blocks without a mouse moved to **QE-13**, and checks on the apps people build to **QE-14**.
6. ✅ **RT-4:** Stop cancels pending *Wait* blocks right away.

With no P1 items left, the fourth wave turns to the P2 items for people building apps:

1. ✅ **RT-5:** a *Go back* block, which returns to the screen shown before. The browser's own Back button in published apps moved to **RT-7**.
2. ✅ **LB-4:** math extras: round, min / max and remainder.
3. ✅ **EL-3**, then ✅ **EL-5:** number boxes and sliders, then links, dividers and spacers.
4. ✅ **UX-8:** "Where is this used?" for elements and variables.
5. ✅ **QE-13:** connecting and moving blocks without a mouse.
6. **QE-9:** more unit tests for the runtime controller, persistence and the model tree.

Smaller P3 fixes, such as **UX-12** (the Projects menu closing on mouse-leave), can be picked up between these.

---

## 1. Backend (phase 2)
The engine (`packages/engine`) is free of React, DOM and Node code, and its type-check enforces that. It reaches the outside world only through `HostApi`, so the same interpreter can run on a server.

| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| BE-1 | Split into a monorepo: `packages/engine`, `apps/editor`, `apps/server` | P1 | Shipped: npm workspaces with `packages/engine` and `apps/editor`; the engine owns the graph types and is type-checked without DOM or Node types. `apps/server` is added by BE-2 |
| BE-2 | Server runtime (Node) that runs graphs using the shared engine | P1 | Shipped: `apps/server`, a Hono server with a server `HostApi` and a `POST /api/run` endpoint that runs one event block of a graph sent with the request. Blocks that touch the screen stop with a friendly message. Saved values are kept in memory until BE-3 picks a database; graphs are sent with each request until BE-6 adds server triggers |
| BE-3 | Visual **data tables**: a schema editor (columns, types) | P1 | Shipped: a *Data* tab where tables and their *Text*, *Number* and *Yes / No* columns are designed. Columns are saved in the project (`tables`); every row gets an automatic `id`. Rows are stored by the server in **SQLite** (Node's built-in `node:sqlite`), starting with BE-4 / BE-5 |
| BE-4 | Table data viewer/editor inside the builder | P2 | Shipped: rows under the columns in the Data tab, with add, edit and delete. The server keeps them in SQLite (`node:sqlite`, `apps/server/data/code-blocks.db`), by column id, through `/api/projects/:projectId/tables/:tableId/rows` |
| BE-5 | Table blocks: *Query table*, *Add row*, *Update row*, *Delete row* | P1 | Shipped as *Get rows* (with an optional *where column is* filter), *Add row*, *Update row* and *Delete row* in a new *Tables* group. Rows are records keyed by column name plus `id`. They run in the app (through the server's row routes) and on the server (`TablesApi` in `HostApi`) |
| BE-6 | Server workflow triggers: *On HTTP request*, *On form submit*, *On schedule* | P1 | Shipped as an *On the server* group: *When web address is called* (`/api/hooks/:projectId/:path`), *When form is sent* (sent from the app by *Send form to server*), *On a schedule* (every N minutes / hours, or daily at a time) and *Reply*. They run from a copy of the project sent with *☁ Server → Deploy*, kept in SQLite, so edits go live only when deployed again. The deploy and web address routes have no sign-in yet (PL-1, BE-11) |
| BE-7 | *Fetch from API* block (GET/POST, JSON result, pick a field) | P1 | Shipped: Get/Post/Put/Patch/Delete, a dotted *Pick field* path, JSON bodies from records, a *Headers* record, and an *If it fails* branch. It runs in the browser, so only APIs that allow browser apps (CORS) work, and headers such as API keys are visible to anyone using the app (see BE-8, BE-10) |
| BE-8 | Server-side secrets store for API keys | P1 | Shipped: *☁ Server → Secrets* adds, replaces and deletes a project's secrets; the server keeps them in SQLite and only ever sends their names back. The *Secret* block reads one in server workflows (it stops with a message in the app), and runs hide the values of secrets they read as ••• in replies, messages, errors, variables and run details. That hiding is a safety net: a workflow that changes a secret before showing it can still reveal it |
| BE-9 | *Send email* block | P3 | Needs the server runtime. The server can send email since PL-7 (`mailer.ts`, SMTP settings); a block would need limits of its own, so apps can't be used to send spam |
| BE-10 | Send *Fetch from API* requests through the server | P1 | Shipped: a *Send from* setting (*The app* / *The server*) and `POST /api/fetch`, for APIs that block browser apps (CORS). The proxy never fills in secrets, since anyone using the app could send them anywhere; apps that need an API key call a server workflow's web address, which uses the *Secret* block. Like the server workflows, the proxy may reach any address, so BE-11 has to limit it before hosting |
| BE-11 | Host the server runtime: a production build, deployment, and limits on where runs may send web requests | P1 | Shipped: `npm start` serves the built editor, published apps (`/app/*`) and the API from one server (`STATIC_DIR`, `--serve-editor`). Requests from server workflows and `POST /api/fetch` can't reach private addresses, checked on every connection, redirects included (`ALLOW_PRIVATE_ADDRESSES` for local use). Rate limits on failed sign-ins, sign-ups, `POST /api/fetch`, `POST /api/run`, and web address and form calls (`limits.ts`, `RATE_LIMITS=off`). Secrets are encrypted with AES-256-GCM (`SECRETS_KEY` or a key file). `TRUST_PROXY` for running behind a proxy that handles https. The counts are kept in memory, for one server (BE-14) |
| BE-14 | Share rate limits between server instances | P3 | The limits of BE-11 are counted in each server's memory and start over when it restarts. Running several copies of the server needs the counts in a shared place, such as the database |
| BE-12 | Clean up rows of deleted tables and projects | P3 | Deleting a table or project in the editor leaves its rows on the server, so undo can bring a table back with its rows. Remove them after a while, or when a project is deleted for good |
| BE-13 | Try server workflows without deploying | P1 | Shipped: a *Try it* section in the settings of *When web address is called*, *When form is sent* and *On a schedule* (*Run now*). It runs the editor's current copy once on the server with sample data, through `POST /api/run` with `replies: true`, and shows the reply, messages and errors; the blocks that ran go to the Run log. Tries use the real tables and saved values |

## 2. Platform
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| PL-1 | User accounts and sign-in | P1 | Shipped: email and password accounts (scrypt), 30-day session cookies, and project ownership (the first account to use a project on the server owns it). Signing in is optional; the server features need it. Not yet: password reset and account settings (PL-7), or limits on sign-in attempts (BE-11) |
| PL-2 | Cloud project storage (replaces localStorage) | P1 | Shipped: signed in, projects are saved to the account (`/api/projects`), with a version on each save so a copy changed in another tab or browser isn't overwritten without asking. Guests keep saving in the browser; export/import stay. A copy stays in the browser only while it can't be saved to the account, so account projects can't be opened while the server is unreachable. Deleting a project stops its server workflows, but its table rows and secrets stay with the account |
| PL-3 | Publish an app to a shareable URL | P1 | Shipped: *🔗 Publish* puts a copy of the project on `/app/:slug` (12 random characters), opened without the editor or an account. Publishing again replaces the copy and keeps the link. Visitors can read the rows of its tables but not change them; forms and web addresses work as before. Visitors can't send requests from the server (BE-10) or add rows yet (PL-8) |
| PL-4 | Share projects and collaborate | P3 | |
| PL-5 | Project version history and restore | P3 | |
| PL-6 | Project gallery with thumbnails | P3 | |
| PL-7 | Password reset by email, and account settings (change email or password, delete the account) | P2 | Shipped: *Forgot your password?* emails a link (`/#reset=…`) that works once, for an hour, and signs out the account's other sessions. Email goes through an SMTP server (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, with `PUBLIC_URL` for the links); without one it's written to the server's log. The 👤 menu changes the password (signing out other browsers), changes the email (telling the old address), and deletes the account with its projects' saved copies, rows, secrets, saved values, deployments and published apps. Each change asks for the current password. Reset emails are limited to 3 an hour per email. Not yet: confirming a new email address before it's used |
| PL-8 | Visitor access for published apps: a per-table setting so visitors can add rows (sign-up lists, guestbooks) | P2 | Shipped: each table's *Visitors of the published app can* setting in the Data tab: see the rows (the default), see them and add new ones, or only add new ones without seeing any. `POST /api/published/:slug/tables/:tableId/rows` keeps only the table's columns, each as its column's kind, and allows 30 visitor rows a minute per project. Changing and deleting rows stays with the owner. Requests sent from the server moved to PL-9. There is no limit on how many rows visitors add in all |
| PL-9 | Let published apps send *Fetch from API* requests from the server | P3 | Split from PL-8. Visitors can't use `POST /api/fetch`, which needs an account; a route for published apps would need a per-project limit like PL-8's, and should only send the requests the published blocks make |

## 3. Editor UX
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| UX-1 | Copy / paste / duplicate for elements and blocks | P1 | Shipped: Ctrl+C/X/V/D and *Duplicate* buttons; several blocks can be selected and keep the wires between them; the clipboard works across projects. Copying several elements at once waits for UX-5 |
| UX-2 | Layers panel: a tree outline of the screen | P1 | Easier selection of nested items. Shipped: select, rename, open/close rows, arrow keys, and hover to outline on the canvas |
| UX-3 | Drag a wire into empty space → suggest compatible blocks | P1 | Big help for beginners. Shipped: a searchable menu of blocks that fit, from outputs and inputs; the picked block is added already wired, in one undo step |
| UX-4 | Right-click context menus (design and logic) | P2 | |
| UX-5 | Multi-select in the design canvas | P2 | |
| UX-6 | Comments and group frames in the logic graph | P2 | |
| UX-7 | Auto-arrange (tidy) the logic graph | P2 | |
| UX-8 | "Where is this used?" for elements and variables | P2 | Shipped: a *Used by* list in the Settings panel for an element (the blocks that point at it) and in the Variables panel for a variable (its blocks, then the element settings 🔗 linked to it). Blocks are described by their sentences, and an event block also names the block it runs first; clicking one opens it in the Logic tab, and clicking a setting selects the element on its screen. Data tables could get the same list later |
| UX-9 | Guided onboarding tutorial for first-time users | P2 | |
| UX-10 | Freely resizable preview (beyond phone/tablet/desktop) | P3 | |
| UX-11 | Touch / tablet support for the editor | P3 | |
| UX-12 | Projects menu: close on click-outside instead of mouse-leave | P3 | Today it closes by itself when deleting a project makes it shorter (found by the end-to-end tests). This also makes `persistence.spec.ts` › *lists, switches between and deletes projects* flaky in CI: the menu can close just after the test checks it is open (seen on #27, where all three tries failed and a re-run passed) |
| UX-13 | Handle item-linked settings when an element is moved out of a List | P3 | Today the setting stays linked to an item field and shows nothing; offer to unlink it, or warn |
| UX-14 | Drag rows in the layers panel to move elements | P3 | Follow-up to UX-2; today elements are moved by dragging on the canvas |

## 4. UI elements and styling
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| EL-1 | Dropdown (select) element | P1 | Shipped: typed choices or a linked list variable (with a field for records); works with the text box blocks and *When value changes* |
| EL-2 | List with item templates (cards with several fields) | P1 | Shipped: elements inside a List form a card that repeats per item, settings can show item fields, and card buttons pass their item to *When button clicked*. Text boxes, checkboxes and nested lists can't be repeated in cards yet |
| EL-3 | Number input / slider | P2 | Shipped as a *Number Box* and a *Slider*, with smallest and biggest numbers, a step and a starting value (a slider can show its number). Blocks read them as numbers kept within their ends, and a slider's on a step; *Get / Set text box value* and *When value changes* work with both. Like text boxes, they stay out of List cards |
| EL-4 | Grid / columns layout | P2 | |
| EL-5 | Link, divider and spacer elements | P2 | Shipped: a *Link* opens a web page, an email (`mailto:`) or a phone number (`tel:`); other kinds of address, such as `javascript:`, are refused. Published apps open it in the same tab or a new one, as set; the editor's preview always uses a new tab. *Set text* changes its text. A *Divider* is a line (upright side by side), and a *Spacer* is empty space, striped while designing |
| EL-6 | Date picker | P3 | |
| EL-7 | Icon element | P3 | |
| EL-8 | More styling: width/height, margins, corner radius, shadow, fonts | P1 | Shipped: a Style section on every element (width, height, space around, rounded corners, shadow, font); sizes in pixels, empty means automatic; the screen's font applies to the whole screen |
| EL-9 | App-wide themes (colours, fonts) | P2 | |
| EL-10 | Sizes as a share of the space (%, fill) and blocks that change an element's style while running | P3 | Follow-up to EL-8, which only takes pixel sizes set in the designer |

## 5. Logic blocks
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| LB-1 | Text blocks: uppercase/lowercase, contains, length, split, replace | P1 | Shipped: *Change text*, *Text contains* (contains / starts with / ends with), *Text length*, *Replace text*, *Split text* |
| LB-2 | List blocks: insert at, find, sort, filter, update item | P1 | Shipped: *Find in list*, *Sort list*, *Filter list*, *Join list into text*, *Insert into list*, *Change item in list*. Find, sort, filter and join take an optional record field |
| LB-3 | Records (objects with named fields) as a value type | P1 | Needed for tables and cards. Shipped: the record type, record variables, *Make record*, *Get field*, *Change field* and *Set field of variable* |
| LB-4 | Math extras: round, min/max, remainder | P2 | Shipped: *Math* can also give the remainder of A ÷ B, and the smaller or bigger of two numbers. A new *Round number* block rounds to the nearest, down or up, to whole numbers or up to 10 decimal places. Halves round away from zero, and numbers like 1.005 round as written |
| LB-5 | Date and time blocks | P2 | |
| LB-6 | Custom reusable blocks (functions) | P2 | |
| LB-7 | Local variables scoped to a single run | P3 | |
| LB-8 | *Repeat while* loop and *Stop loop* | P3 | |
| LB-9 | More events: key pressed, list item clicked, hover | P2 | A button inside a List card already reports its item (EL-2); this is for clicking the card itself |
| LB-10 | Typed starting values for list items and record fields (numbers, yes/no) | P3 | The Variables panel stores them as text today; the forgiving conversions hide this in most cases |

## 6. Run mode and debugging
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| RT-1 | Show live values on wires while running | P1 | Shipped: each data wire shows the last value read through it, summed up for lists and records, with the whole value on hover; cleared on Stop |
| RT-2 | Run log panel (which blocks ran, with values) | P2 | Shipped: a Run log under the Logic tab's preview, grouped by event, with each block's inputs and errors; click a line to show its block |
| RT-3 | Step-through debugger with breakpoints | P3 | |
| RT-4 | Cancel pending *Wait* blocks immediately on Stop | P2 | Shipped: Stop ends each pending wait, and a stopped run ends before its next block, without reporting an error. Before, the blocks after a wait still ran once it finished: their changes to the app were ignored, but a *Fetch from API* after a wait still sent its request. Server workflows already cancelled their waits when stopped |
| RT-5 | Navigation history and a *Go back* block | P2 | Shipped: a running app remembers the screens it showed (up to 50), and *Go back* returns to the one before, running its *When screen opens* blocks again. On the first screen it does nothing; screens deleted while the app runs are skipped. On the server it stops with a friendly message, like *Go to screen* |
| RT-6 | Run details for server workflow runs | P3 | The ☁ Server menu lists runs with their errors and messages; also show which blocks ran with their values, like the Run log |
| RT-7 | The browser's Back button in published apps | P3 | Follow-up to RT-5. Visitors expect Back (or a phone's back gesture) to return to the screen before, as *Go back* does; today it leaves the app. Each screen change would add a browser history entry |

## 7. AI assistance
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| AI-1 | "Describe your app" → generate screens and blocks | P2 | |
| AI-2 | "Explain this logic" in plain English | P3 | |
| AI-3 | Suggested fixes for blocks that show errors | P3 | |

## 8. Quality and engineering
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| QE-1 | Add the browser end-to-end tests (Playwright) to the repo | P1 | `e2e/`, covering every v1 feature |
| QE-2 | GitHub Actions CI: test, type-check, build | P1 | |
| QE-3 | Code-split the bundle (it is currently over 500 kB) | P2 | Shipped: the editor and published apps are loaded separately (`main.tsx`), and the Logic tab with React Flow (`LogicWorkspace.tsx`) is loaded on its own, fetched once the editor is open. The project check uses `zod/mini`. A published app now downloads 349 kB (108 kB gzipped) instead of 727 kB (222 kB); the editor 463 kB before the Logic tab. No chunk is over 500 kB |
| QE-4 | Validate the project file format (e.g. zod) and test migrations | P1 | Shipped: `packages/engine/src/project.ts` holds the format, its version (now 2) with step-by-step upgrades in `MIGRATIONS`, and a zod check with plain messages. The editor checks imported and saved projects; the server checks the graph, variables and tables it runs and deploys. When the format changes, bump `PROJECT_VERSION` and add a step |
| QE-5 | Accessibility pass (keyboard, screen readers, contrast) | P2 | Shipped: `e2e/accessibility.spec.ts` runs axe (WCAG 2.1 A and AA, and best practices) on each tab, the inspector for elements and blocks, the menus, a running app, an empty project and a published app, and fails on any finding. Fixed: text and block colours too light to read (the muted grey, *Run*, variable type chips, block headers, palette category titles), fields in the inspector and on blocks without names, layer rows named differently from what they show, buttons on the design canvas holding other controls, unnamed side panels, missing page headings, and icon-only buttons named only by a `title`. The menus close with Escape and put the keyboard back on their button, and anything the keyboard is on gets one clear ring. Not tested with a screen reader by hand |
| QE-6 | Performance with large graphs and screens | P3 | |
| QE-7 | Export an app as standalone HTML or generated code | P3 | |
| QE-8 | Visual regression screenshots for the editor and templates | P3 | Playwright `toHaveScreenshot` |
| QE-9 | Raise unit test coverage (about 24% today) | P2 | Runtime controller, persistence, model tree |
| QE-10 | Review React Flow's `hideAttribution` setting | P1 | Shipped: the Logic tab shows React Flow's attribution again, in the bottom-right corner under the minimap. React Flow asks that only Pro subscribers hide it |
| QE-13 | Connect and move blocks without a mouse | P2 | Shipped: a block's Settings has a *Wires* section that lists each of its pins with what it's wired to (each with a Disconnect button) and a list of the pins on other blocks that fit. A selected block moves with the arrow keys (Shift for bigger steps); the move is saved, and a run of key presses is one undo step. In the Layers panel, Alt+arrow keys move the selected element up or down, into the box above it, or out of its box |
| QE-14 | Accessibility checks for the apps people build | P3 | Warn in the editor when an image has no description, a text box has no label, or chosen colours are hard to read, and let images have a description |
| QE-12 | Find the stray 401 in *a project used by one account is kept from others* | P1 | Shipped: signing out first sends a change still waiting for autosave, then waits for requests already sent (up to 5 seconds) before ending the session. Before, a change made less than a moment before signing out was saved nowhere, and a request answered after the session ended logged the 401 that failed the test |
| QE-11 | Make the end-to-end tests reliable in Firefox and WebKit | P3 | Drag tests are marked `test.fixme` there: pointer drags hang in Firefox automation, and some drops don't register in WebKit. Local headless Firefox on Windows also hit graphics-process crashes and timeouts under parallel load. In WebKit, Ctrl+click selects only one block in the Logic tab, so that copy test is marked `test.fixme` there too, as is pasting into a settings text box, which depends on the system clipboard there and fails on some runs. CI runs Chromium only. |
