import { describe, expect, it } from 'vitest';
import { dropdownChoices } from './elements';
import { makeElement, makeProject } from './factory';
import { canPlaceInside } from './tree';

describe('dropdownChoices', () => {
  it('takes one choice per line, skipping empty lines and repeats', () => {
    expect(dropdownChoices('Small\n Medium \n\nLarge\nSmall')).toEqual(['Small', 'Medium', 'Large']);
    expect(dropdownChoices('')).toEqual([]);
  });

  it('takes the items of a list, or one field of each record', () => {
    expect(dropdownChoices(['Red', 2, '', true])).toEqual(['Red', '2', 'true']);
    const people = [
      { name: 'Ada', city: 'London' },
      { name: 'Bo', city: 'Rome' },
    ];
    expect(dropdownChoices(people, 'City')).toEqual(['London', 'Rome']);
    // Without a field, a record shows its first field.
    expect(dropdownChoices(people)).toEqual(['Ada', 'Bo']);
  });
});

it('keeps dropdowns out of List cards, like text boxes', () => {
  const project = makeProject();
  const list = makeElement('list', 'People');
  project.screens[0].root.children.push(list);
  expect(canPlaceInside(project.screens[0].root, list.id, 'dropdown')).toBe(false);
  expect(canPlaceInside(project.screens[0].root, project.screens[0].root.id, 'dropdown')).toBe(true);
});
