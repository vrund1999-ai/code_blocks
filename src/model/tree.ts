import type { NameLookup } from '../engine/types';
import { ELEMENT_DEFS } from './elements';
import type { ElementType, Project, Screen, UIElement } from './types';

export function walk(el: UIElement, fn: (el: UIElement, parent: UIElement | null) => void, parent: UIElement | null = null) {
  fn(el, parent);
  for (const c of el.children) walk(c, fn, el);
}

export function findElement(root: UIElement, id: string): UIElement | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const hit = findElement(c, id);
    if (hit) return hit;
  }
  return null;
}

export function findParent(root: UIElement, id: string): UIElement | null {
  for (const c of root.children) {
    if (c.id === id) return root;
    const hit = findParent(c, id);
    if (hit) return hit;
  }
  return null;
}

export function findInProject(project: Project, id: string): { el: UIElement; screen: Screen } | null {
  for (const screen of project.screens) {
    const el = findElement(screen.root, id);
    if (el) return { el, screen };
  }
  return null;
}

export function collectIds(el: UIElement): string[] {
  const ids: string[] = [];
  walk(el, (e) => ids.push(e.id));
  return ids;
}

export interface ElementRef {
  id: string;
  name: string;
  type: UIElement['type'];
  screenId: string;
  screenName: string;
}

/** Every element in the project except screen roots, for pickers. */
export function allElements(project: Project): ElementRef[] {
  const out: ElementRef[] = [];
  for (const s of project.screens) {
    walk(s.root, (e, parent) => {
      if (parent) out.push({ id: e.id, name: e.name, type: e.type, screenId: s.id, screenName: s.name });
    });
  }
  return out;
}

/** The nearest List that `id` is inside (not counting the element itself). */
export function enclosingList(root: UIElement, id: string): UIElement | null {
  let found: UIElement | null = null;
  const visit = (el: UIElement, list: UIElement | null): boolean => {
    if (el.id === id) {
      found = list;
      return true;
    }
    const inner = el.type === 'list' ? el : list;
    return el.children.some((c) => visit(c, inner));
  };
  visit(root, null);
  return found;
}

export function enclosingListInProject(project: Project, id: string): UIElement | null {
  const found = findInProject(project, id);
  return found ? enclosingList(found.screen.root, id) : null;
}

/**
 * Elements that keep one value per element (what is typed, ticked, or the
 * list's own items) can't be repeated in a List's cards.
 */
export const NOT_IN_LIST_CARDS: ElementType[] = ['input', 'checkbox', 'list'];

/** Can `el` (with everything inside it) go inside `parentId`? */
export function canPlaceInside(root: UIElement, parentId: string, el: UIElement | ElementType): boolean {
  const parent = findElement(root, parentId);
  if (!parent || !ELEMENT_DEFS[parent.type].canHaveChildren) return false;
  const inCard = parent.type === 'list' || enclosingList(root, parentId) !== null;
  if (!inCard) return true;
  if (typeof el === 'string') return !NOT_IN_LIST_CARDS.includes(el);
  let ok = true;
  walk(el, (e) => {
    if (NOT_IN_LIST_CARDS.includes(e.type)) ok = false;
  });
  return ok;
}

/** Names for elements, variables and screens, as blocks show them. */
export function makeNameLookup(project: Project): NameLookup {
  return {
    element: (id) => (typeof id === 'string' ? findInProject(project, id)?.el.name : undefined),
    variable: (id) => project.variables.find((v) => v.id === id)?.name,
    screen: (id) => project.screens.find((s) => s.id === id)?.name,
    inList: (id) => typeof id === 'string' && enclosingListInProject(project, id) !== null,
  };
}

/** A row of the layers panel. */
export interface LayerRow {
  el: UIElement;
  depth: number;
  parentId: string | null;
  /** Inside a List, elements make up the card that repeats for each item. */
  inCard: boolean;
}

/** The layers panel rows that show: every element, minus the insides of collapsed ones. */
export function layerRows(root: UIElement, collapsed: Set<string>): LayerRow[] {
  const rows: LayerRow[] = [];
  const visit = (el: UIElement, depth: number, parentId: string | null, inCard: boolean) => {
    rows.push({ el, depth, parentId, inCard });
    if (collapsed.has(el.id)) return;
    for (const c of el.children) visit(c, depth + 1, el.id, inCard || el.type === 'list');
  };
  visit(root, 0, null, false);
  return rows;
}

/** Ids of the elements that contain `id`, outermost first. */
export function ancestorIds(root: UIElement, id: string): string[] {
  const parents = new Map<string, string>();
  walk(root, (el, parent) => void (parent && parents.set(el.id, parent.id)));
  const out: string[] = [];
  for (let p = parents.get(id); p; p = parents.get(p)) out.unshift(p);
  return out;
}
