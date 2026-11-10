import { nanoid } from 'nanoid';
import { defaultProps, ELEMENT_DEFS } from './elements';
import { PROJECT_VERSION, type ElementType, type Project, type Screen, type UIElement, type Variable } from './types';
import { allElements } from './tree';

export const newId = () => nanoid(10);

export function makeElement(type: ElementType, name: string, overrides: Record<string, unknown> = {}): UIElement {
  const props = defaultProps(type);
  for (const [k, v] of Object.entries(overrides)) props[k] = { kind: 'static', value: v };
  return { id: newId(), type, name, props, children: [] };
}

export function makeScreen(name: string): Screen {
  const root = makeElement('container', 'Screen');
  root.props.padding = { kind: 'static', value: 20 };
  root.props.gap = { kind: 'static', value: 12 };
  root.props.border = { kind: 'static', value: false };
  return { id: newId(), name, root };
}

export function makeProject(name = 'My App'): Project {
  return {
    id: newId(),
    name,
    version: PROJECT_VERSION,
    screens: [makeScreen('Home')],
    variables: [],
    graph: { nodes: [], edges: [] },
  };
}

export function defaultInitial(type: Variable['type']): unknown {
  return type === 'number' ? 0 : type === 'boolean' ? false : type === 'list' ? [] : '';
}

/** "Button 3" — the next unused friendly name for an element type. */
export function nextElementName(project: Project, type: ElementType): string {
  const base = ELEMENT_DEFS[type].label;
  const taken = new Set(allElements(project).map((e) => e.name));
  let i = 1;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function nextName(existing: string[], base: string): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}
