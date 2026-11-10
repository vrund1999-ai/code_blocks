import type { Project, Screen, UIElement } from './types';

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
