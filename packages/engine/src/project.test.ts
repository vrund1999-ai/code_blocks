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
      'In screen “Home” → element “Out”: “type” is “video”, which should be one of container, text, button, input, image, checkbox, dropdown, list.',
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

  it('names lists that are the wrong kind', () => {
    expect(problem({ ...project(), variables: {} })).toBe('“variables” should be a list.');
    expect(problem({ ...project(), graph: { nodes: [] } })).toBe('“edges” is missing.');
  });
});
