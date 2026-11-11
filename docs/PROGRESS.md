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

---

## Roadmap status

### 1. Backend (phase 2)
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| BE-1 | Monorepo split | ⬜ | | |
| BE-2 | Server runtime | ⬜ | | |
| BE-3 | Data tables schema editor | ⬜ | | |
| BE-4 | Table data viewer/editor | ⬜ | | |
| BE-5 | Table blocks | ⬜ | | |
| BE-6 | Server workflow triggers | ⬜ | | |
| BE-7 | Fetch from API block | ⬜ | | |
| BE-8 | Secrets store | ⬜ | | |
| BE-9 | Send email block | ⬜ | | |

### 2. Platform
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| PL-1 | Accounts and sign-in | ⬜ | | |
| PL-2 | Cloud project storage | ⬜ | | |
| PL-3 | Publish to a URL | ⬜ | | |
| PL-4 | Sharing / collaboration | ⬜ | | |
| PL-5 | Version history | ⬜ | | |
| PL-6 | Project gallery | ⬜ | | |

### 3. Editor UX
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| UX-1 | Copy / paste / duplicate | ⬜ | | |
| UX-2 | Layers panel | ⬜ | | |
| UX-3 | Wire-to-empty-space block suggestions | ⬜ | | |
| UX-4 | Context menus | ⬜ | | |
| UX-5 | Multi-select in design | ⬜ | | |
| UX-6 | Graph comments / groups | ⬜ | | |
| UX-7 | Auto-arrange graph | ⬜ | | |
| UX-8 | "Where is this used?" | ⬜ | | |
| UX-9 | Onboarding tutorial | ⬜ | | |
| UX-10 | Resizable preview | ⬜ | | |
| UX-11 | Touch support | ⬜ | | |
| UX-12 | Projects menu click-outside | ⬜ | | |

### 4. UI elements and styling
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| EL-1 | Dropdown | ⬜ | | |
| EL-2 | List item templates (cards) | ⬜ | | |
| EL-3 | Number input / slider | ⬜ | | |
| EL-4 | Grid / columns layout | ⬜ | | |
| EL-5 | Link, divider, spacer | ⬜ | | |
| EL-6 | Date picker | ⬜ | | |
| EL-7 | Icon | ⬜ | | |
| EL-8 | More styling options | ⬜ | | |
| EL-9 | Themes | ⬜ | | |

### 5. Logic blocks
| ID | Item | Status | Completed | PR |
| --- | --- | --- | --- | --- |
| LB-1 | Text blocks | ⬜ | | |
| LB-2 | List blocks | ⬜ | | |
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
| RT-1 | Live values on wires | ⬜ | | |
| RT-2 | Run log panel | ⬜ | | |
| RT-3 | Step-through debugger | ⬜ | | |
| RT-4 | Cancel waits on Stop | ⬜ | | |
| RT-5 | Navigation history / Go back | ⬜ | | |

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
| QE-4 | Project format validation | ⬜ | | |
| QE-5 | Accessibility pass | ⬜ | | |
| QE-6 | Large-graph performance | ⬜ | | |
| QE-7 | Export as standalone app / code | ⬜ | | |
| QE-8 | Visual regression screenshots | ⬜ | | |
| QE-9 | Raise unit test coverage | ⬜ | | |
| QE-10 | React Flow attribution review | ⬜ | | |
| QE-11 | Drag tests in Firefox / WebKit | ⬜ | | |

---

**Totals:** 3 / 65 done · 0 in progress
