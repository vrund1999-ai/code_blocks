import { describe, expect, it } from 'vitest';
import { getNodeDef, outputPins } from '../engine/registry';
import { makeElement, makeProject } from './factory';
import { ancestorIds, canPlaceInside, enclosingList, layerRows, makeNameLookup } from './tree';

function cardsProject() {
  const project = makeProject('Cards');
  const root = project.screens[0].root;
  const list = makeElement('list', 'People');
  const box = makeElement('container', 'Card Box');
  const name = makeElement('text', 'Name');
  const save = makeElement('button', 'Save');
  const other = makeElement('button', 'Other');
  box.children.push(name);
  list.children.push(box, save);
  root.children.push(list, other);
  return { project, root, list, box, name, save, other };
}

describe('List cards in the element tree', () => {
  it('finds the nearest List around an element', () => {
    const { root, list, box, name, other } = cardsProject();
    expect(enclosingList(root, name.id)?.id).toBe(list.id);
    expect(enclosingList(root, box.id)?.id).toBe(list.id);
    expect(enclosingList(root, list.id)).toBeNull();
    expect(enclosingList(root, other.id)).toBeNull();
  });

  it('keeps text boxes, checkboxes and lists out of cards, even inside a box', () => {
    const { root, list, box, other } = cardsProject();
    for (const parent of [list.id, box.id]) {
      expect(canPlaceInside(root, parent, 'text')).toBe(true);
      expect(canPlaceInside(root, parent, 'button')).toBe(true);
      expect(canPlaceInside(root, parent, 'input')).toBe(false);
      expect(canPlaceInside(root, parent, 'checkbox')).toBe(false);
      expect(canPlaceInside(root, parent, 'list')).toBe(false);
    }
    const wrapper = makeElement('container', 'Wrapper');
    wrapper.children.push(makeElement('input', 'Box'));
    expect(canPlaceInside(root, list.id, wrapper)).toBe(false);
    expect(canPlaceInside(root, root.id, wrapper)).toBe(true);
    expect(canPlaceInside(root, other.id, 'text')).toBe(false); // buttons hold nothing
  });

  it('gives "When button clicked" item pins only for buttons in a card', () => {
    const { project, save, other } = cardsProject();
    const names = makeNameLookup(project);
    const def = getNodeDef('event.click')!;
    expect(outputPins(def, { element: save.id }, names).map((p) => p.id)).toEqual(['next', 'item', 'index']);
    expect(outputPins(def, { element: other.id }, names).map((p) => p.id)).toEqual(['next']);
    expect(outputPins(def, {}, names).map((p) => p.id)).toEqual(['next']);
  });
});

describe('layer rows', () => {
  const screen = makeElement('container', 'Screen');
  const box = makeElement('container', 'Box');
  const list = makeElement('list', 'People');
  const name = makeElement('text', 'Name');
  const title = makeElement('text', 'Title');
  list.children.push(name);
  box.children.push(list);
  screen.children.push(title, box);

  it('lists every element in order, with depth and whether it is in a card', () => {
    const rows = layerRows(screen, new Set());
    expect(rows.map((r) => [r.el.name, r.depth, r.inCard])).toEqual([
      ['Screen', 0, false],
      ['Title', 1, false],
      ['Box', 1, false],
      ['People', 2, false],
      ['Name', 3, true],
    ]);
    expect(rows[3].parentId).toBe(box.id);
  });

  it('hides what is inside collapsed elements', () => {
    expect(layerRows(screen, new Set([box.id])).map((r) => r.el.name)).toEqual(['Screen', 'Title', 'Box']);
  });

  it('finds the elements around an element, outermost first', () => {
    expect(ancestorIds(screen, name.id)).toEqual([screen.id, box.id, list.id]);
    expect(ancestorIds(screen, screen.id)).toEqual([]);
  });
});
