# Code Blocks

Build apps without writing code. Lay out your screens by dragging elements, make them do things by connecting blocks with arrows, and press **▶ Run** to use your app straight away.

## Getting started

```bash
npm install
npm run dev        # open http://localhost:5173
npm test           # unit tests (engine + project store)
npm run build      # type-check + production build
```

## How it works

- **🎨 Design tab:** drag Boxes, Text, Buttons, Text Boxes, Checkboxes, Images and Lists onto a screen. Click any element to change it in the Settings panel. Use 🔗 *link* to tie a setting to a variable, so it updates live.
- **⚡ Logic tab:** a node graph.
  - **When…** blocks start things, for example *When button clicked*.
  - White arrows decide what happens next: **Do…** blocks, and **Decide & repeat** blocks such as *If*, *Repeat* and *For each*.
  - Coloured dotted wires carry **Values** into blocks, such as text, numbers, maths and comparisons.
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

### Adding a block
Add a `NodeDef` to one of `src/engine/nodes/*.ts`. It declares pins, settings, a plain-English `sentence`, an optional `validate`, and `execute` (for actions and flow) or `evaluate` (for values). The palette, the block UI, connection checking and the inspector all pick it up automatically.

## Roadmap
All the planned next steps are listed in [docs/ROADMAP.md](docs/ROADMAP.md), and their completion is tracked in [docs/PROGRESS.md](docs/PROGRESS.md).
