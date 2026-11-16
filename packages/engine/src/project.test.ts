import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrateProject, parseProject, PROJECT_VERSION, type Project, type UIElement } from './project';

const el = (id: string, type: UIElement['type'], name: string, children: UIElement[] = []): UIElement => ({
  id,
  type,
  name,
  props: {},
  children,
});

function project(): Project {
  return {
    id: 'p1',
    name: 'Shop',
    version: PROJECT_VERSION,
    screens: [{ id: 's1', name: 'Home', root: el('root', 'container', 'Screen', [el('t1', 'text', 'Out')]) }],
    variables: [{ id: 'v1', name: 'count', type: 'number', initial: 0 }],
    tables: [{ id: 't', name: 'Orders', columns: [{ id: 'c', name: 'Item', type: 'text' }] }],
    graph: {
      nodes: [
        { id: 'n1', type: 'event.click', position: { x: 0, y: 0 }, config: { element: 't1' } },
        { id: 'n2', type: 'action.toast', position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [{ id: 'e1', source: 'n1', sourcePin: 'next', target: 'n2', targetPin: 'in', kind: 'exec' }],
    },
  };
}

/** The message parseProject gives for `p`. */
const problem = (p: unknown) => {
  try {
    parseProject(p);
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected the project to be refused');
};

describe('upgrading project files', () => {
  it('has a step for every older version', () => {
    for (let v = 1; v < PROJECT_VERSION; v++) expect(MIGRATIONS[v], `step from version ${v}`).toBeTypeOf('function');
  });

  it('gives version 1 files without tables an empty table list', () => {
    const { tables: _, ...old } = project();
    expect(migrateProject({ ...old, version: 1 })).toMatchObject({ version: PROJECT_VERSION, tables: [] });
    // Files from before versions were written count as version 1.
    const { version: __, ...unversioned } = old;
    expect(parseProject(unversioned).tables).toEqual([]);
  });

  it('takes the old default colours off version 2 Texts and Boxes, so they follow the theme', () => {
    const p = project();
    const text = (color: unknown): UIElement => ({ ...el(`t${String(color)}`, 'text', 'T'), props: { color: { kind: 'static', value: color }, size: { kind: 'static', value: 'large' } } });
    const box = (background: string, children: UIElement[] = []): UIElement => ({ ...el(`b${background}`, 'container', 'Box', children), props: { background: { kind: 'static', value: background }, gap: { kind: 'static', value: 8 } } });
    p.screens[0].root = box('#FFFFFF', [box('#1f2937', [text('#1F2937'), text('#ff0000')])]);
    const up = parseProject({ ...p, version: 2 });
    expect(up.screens[0].root.props).toEqual({ gap: { kind: 'static', value: 8 } });
    const inner = up.screens[0].root.children[0];
    // A Box keeps a colour that was chosen, even the Texts' grey.
    expect(inner.props.background).toEqual({ kind: 'static', value: '#1f2937' });
    const [grey, red] = inner.children;
    expect(grey.props).toEqual({ size: { kind: 'static', value: 'large' } });
    expect(red.props.color).toEqual({ kind: 'static', value: '#ff0000' });
  });

  it('keeps a theme, and refuses colours that aren’t #rrggbb', () => {
    const theme = { accent: '#0b7285', background: '#ffffff', text: '#123a44', font: 'serif', corners: 'round' as const };
    expect(parseProject({ ...project(), theme }).theme).toEqual(theme);
    expect(parseProject(project()).theme).toBeUndefined();
    expect(problem({ ...project(), theme: { accent: 'red' } })).toContain('Colours are written like #5b5bd6.');
    expect(problem({ ...project(), theme: { corners: 'very' } })).toContain('corners');
  });

  it('refuses files from a newer version, and versions that aren’t whole numbers', () => {
    expect(problem({ ...project(), version: PROJECT_VERSION + 1 })).toBe(
      'It was made with a newer version of Code Blocks. Update Code Blocks to open it.',
    );
    expect(problem({ ...project(), version: '2' })).toBe('Its “version” should be a whole number, not "2".');
    expect(problem([])).toBe('It doesn’t look like a Code Blocks project.');
    expect(problem({ hello: 'world' })).toBe('It doesn’t look like a Code Blocks project.');
  });
});

describe('checking projects', () => {
  it('accepts a good project as it is, leaving out unknown fields', () => {
    expect(parseProject(project())).toEqual(project());
    expect(parseProject({ ...project(), extra: 1 })).not.toHaveProperty('extra');
  });

  it('fills in missing block places and settings, and drops wires to blocks that aren’t there', () => {
    const p = {
      ...project(),
      graph: {
        nodes: [{ id: 'n1', type: 'event.click' }],
        edges: [{ id: 'e1', source: 'n1', sourcePin: 'next', target: 'gone', targetPin: 'in', kind: 'exec' }],
      },
    };
    expect(parseProject(p).graph).toEqual({ nodes: [{ id: 'n1', type: 'event.click', position: { x: 0, y: 0 }, config: {} }], edges: [] });
  });

  it('names the place of a problem by screen and element names', () => {
    const p = project();
    delete (p.screens[0].root.children[0] as Partial<UIElement>).type;
    expect(problem(p)).toBe('In screen “Home” → element “Out”: “type” is missing.');

    const q = project();
    q.screens[0].root.children[0].props.text = { kind: 'formula' } as never;
    expect(problem(q)).toBe('In screen “Home” → element “Out” → setting “text”: “kind” is “formula”, which Code Blocks doesn’t know.');

    const r = project();
    (r.screens[0].root.children[0] as { type: string }).type = 'video';
    expect(problem(r)).toBe(
      'In screen “Home” → element “Out”: “type” is “video”, which should be one of container, text, button, input, image, checkbox, dropdown, number, slider, date, link, divider, spacer, list.',
    );
  });

  it('names blocks and wires by number, and counts further problems', () => {
    const p = project();
    (p.graph.nodes[1] as { id: unknown }).id = 5;
    (p.graph.edges[0] as { kind: string }).kind = 'both';
    expect(problem(p)).toBe('In block 2: “id” should be text. (and 1 more problem)');
  });

  it('refuses projects with no screens, repeated ids or a screen that isn’t a container', () => {
    expect(problem({ ...project(), screens: [] })).toBe('A project needs at least one screen.');

    const twice = project();
    twice.screens[0].root.children.push(el('t1', 'button', 'Again'));
    expect(problem(twice)).toBe('In screen “Home”: Two elements have the same id “t1”.');

    const nodes = project();
    nodes.graph.nodes[1].id = 'n1';
    expect(problem(nodes)).toBe('In block 2: Another block has the same id “n1”.');

    const root = project();
    root.screens[0].root.type = 'text';
    expect(problem(root)).toBe('In screen “Home”: A screen’s outermost element must be a container.');
  });

  it('keeps what visitors of the published app may do with a table, and refuses other settings', () => {
    const shared = { ...project(), tables: [{ ...project().tables[0], visitors: 'add' }] };
    expect(parseProject(shared).tables[0].visitors).toBe('add');
    expect(parseProject(project()).tables[0]).not.toHaveProperty('visitors');
    expect(problem({ ...project(), tables: [{ ...project().tables[0], visitors: 'delete' }] })).toMatch(/visitors/);
  });

  it('names lists that are the wrong kind', () => {
    expect(problem({ ...project(), variables: {} })).toBe('“variables” should be a list.');
    expect(problem({ ...project(), graph: { nodes: [] } })).toBe('“edges” is missing.');
  });
});
