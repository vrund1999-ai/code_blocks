# Code Blocks — Roadmap

This file lists all the planned next steps and enhancements. Each item has an ID such as `BE-1`, and its status is tracked in [PROGRESS.md](PROGRESS.md).

Priority: **P1** comes next, **P2** is important but can wait, and **P3** is nice to have.

---

## 1. Backend (phase 2)
The engine (`src/engine/`) is already free of React and DOM code. It reaches the outside world only through `HostApi`, so the same interpreter can run on a server.

| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| BE-1 | Split into a monorepo: `packages/engine`, `apps/editor`, `apps/server` | P1 | Prerequisite for the server runtime |
| BE-2 | Server runtime (Node) that runs graphs using the shared engine | P1 | Server-side `HostApi` implementation |
| BE-3 | Visual **data tables**: a schema editor (columns, types) | P1 | Like a simple spreadsheet |
| BE-4 | Table data viewer/editor inside the builder | P2 | Browse, add and edit rows by hand |
| BE-5 | Table blocks: *Query table*, *Add row*, *Update row*, *Delete row* | P1 | Work on both client and server |
| BE-6 | Server workflow triggers: *On HTTP request*, *On form submit*, *On schedule* | P1 | Graphs flagged to run server-side |
| BE-7 | *Fetch from API* block (GET/POST, JSON result, pick a field) | P1 | Shipped: Get/Post/Put/Patch/Delete, a dotted *Pick field* path, JSON bodies from records, a *Headers* record, and an *If it fails* branch. It runs in the browser, so only APIs that allow browser apps (CORS) work, and headers such as API keys are visible to anyone using the app (see BE-8, BE-10) |
| BE-8 | Server-side secrets store for API keys | P2 | Secrets never reach the client |
| BE-9 | *Send email* block | P3 | Needs the server runtime |
| BE-10 | Send *Fetch from API* requests through the server | P2 | Reaches APIs that block browser apps (CORS) and lets requests use secrets from BE-8. Needs the server runtime |

## 2. Platform
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| PL-1 | User accounts and sign-in | P2 | |
| PL-2 | Cloud project storage (replaces localStorage) | P2 | Keep local export/import |
| PL-3 | Publish an app to a shareable URL | P2 | Run-only view of a project |
| PL-4 | Share projects and collaborate | P3 | |
| PL-5 | Project version history and restore | P3 | |
| PL-6 | Project gallery with thumbnails | P3 | |

## 3. Editor UX
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| UX-1 | Copy / paste / duplicate for elements and blocks | P1 | |
| UX-2 | Layers panel: a tree outline of the screen | P1 | Easier selection of nested items |
| UX-3 | Drag a wire into empty space → suggest compatible blocks | P1 | Big help for beginners |
| UX-4 | Right-click context menus (design and logic) | P2 | |
| UX-5 | Multi-select in the design canvas | P2 | |
| UX-6 | Comments and group frames in the logic graph | P2 | |
| UX-7 | Auto-arrange (tidy) the logic graph | P2 | |
| UX-8 | "Where is this used?" for elements and variables | P2 | |
| UX-9 | Guided onboarding tutorial for first-time users | P2 | |
| UX-10 | Freely resizable preview (beyond phone/tablet/desktop) | P3 | |
| UX-11 | Touch / tablet support for the editor | P3 | |
| UX-12 | Projects menu: close on click-outside instead of mouse-leave | P3 | Today it closes by itself when deleting a project makes it shorter (found by the end-to-end tests) |
| UX-13 | Handle item-linked settings when an element is moved out of a List | P3 | Today the setting stays linked to an item field and shows nothing; offer to unlink it, or warn |

## 4. UI elements and styling
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| EL-1 | Dropdown (select) element | P1 | |
| EL-2 | List with item templates (cards with several fields) | P1 | Shipped: elements inside a List form a card that repeats per item, settings can show item fields, and card buttons pass their item to *When button clicked*. Text boxes, checkboxes and nested lists can't be repeated in cards yet |
| EL-3 | Number input / slider | P2 | |
| EL-4 | Grid / columns layout | P2 | |
| EL-5 | Link, divider and spacer elements | P2 | |
| EL-6 | Date picker | P3 | |
| EL-7 | Icon element | P3 | |
| EL-8 | More styling: width/height, margins, corner radius, shadow, fonts | P1 | |
| EL-9 | App-wide themes (colours, fonts) | P2 | |

## 5. Logic blocks
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| LB-1 | Text blocks: uppercase/lowercase, contains, length, split, replace | P1 | |
| LB-2 | List blocks: insert at, find, sort, filter, update item | P1 | |
| LB-3 | Records (objects with named fields) as a value type | P1 | Needed for tables and cards. Shipped: the record type, record variables, *Make record*, *Get field*, *Change field* and *Set field of variable* |
| LB-4 | Math extras: round, min/max, remainder | P2 | |
| LB-5 | Date and time blocks | P2 | |
| LB-6 | Custom reusable blocks (functions) | P2 | |
| LB-7 | Local variables scoped to a single run | P3 | |
| LB-8 | *Repeat while* loop and *Stop loop* | P3 | |
| LB-9 | More events: key pressed, list item clicked, hover | P2 | A button inside a List card already reports its item (EL-2); this is for clicking the card itself |
| LB-10 | Typed starting values for list items and record fields (numbers, yes/no) | P3 | The Variables panel stores them as text today; the forgiving conversions hide this in most cases |

## 6. Run mode and debugging
| ID | Item | Priority | Notes |
| --- | --- | --- | --- |
| RT-1 | Show live values on wires while running | P1 | |
| RT-2 | Run log panel (which blocks ran, with values) | P2 | |
| RT-3 | Step-through debugger with breakpoints | P3 | |
| RT-4 | Cancel pending *Wait* blocks immediately on Stop | P2 | Today a pending wait finishes, but its effects are ignored |
| RT-5 | Navigation history and a *Go back* block | P2 | |

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
| QE-3 | Code-split the bundle (it is currently over 500 kB) | P2 | Lazy-load React Flow / the Logic tab |
| QE-4 | Validate the project file format (e.g. zod) and test migrations | P2 | |
| QE-5 | Accessibility pass (keyboard, screen readers, contrast) | P2 | Includes icon-only buttons (✕) that have a `title` but no `aria-label`, such as *Delete screen* |
| QE-6 | Performance with large graphs and screens | P3 | |
| QE-7 | Export an app as standalone HTML or generated code | P3 | |
| QE-8 | Visual regression screenshots for the editor and templates | P3 | Playwright `toHaveScreenshot` |
| QE-9 | Raise unit test coverage (about 24% today) | P2 | Runtime controller, persistence, model tree |
| QE-10 | Review React Flow's `hideAttribution` setting | P2 | React Flow asks that only Pro subscribers hide the attribution |
| QE-11 | Make the end-to-end tests reliable in Firefox and WebKit | P3 | Drag tests are marked `test.fixme` there: pointer drags hang in Firefox automation, and some drops don't register in WebKit. Local headless Firefox on Windows also hit graphics-process crashes and timeouts under parallel load. CI runs Chromium only. |
