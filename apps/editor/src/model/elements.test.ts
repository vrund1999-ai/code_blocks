import { describe, expect, it } from 'vitest';
import { defaultProps, dropdownChoices, fitNumber, numberLimits } from './elements';
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

describe('number boxes and sliders', () => {
  it('reads their limits, with a slider always having both ends', () => {
    expect(numberLimits({ min: '', max: '', step: 1 }, false)).toEqual({ min: undefined, max: undefined, step: 1 });
    expect(numberLimits({ min: '', max: '', step: '' }, true)).toEqual({ min: 0, max: 100, step: 1 });
    expect(numberLimits({ min: -5, max: 5, step: 0.5 }, true)).toEqual({ min: -5, max: 5, step: 0.5 });
  });

  it('swaps ends set the wrong way round, and counts a step of 0 or less as 1', () => {
    expect(numberLimits({ min: 10, max: 1, step: 0 }, false)).toEqual({ min: 1, max: 10, step: 1 });
    expect(numberLimits({ min: 0, max: 10, step: -2 }, true).step).toBe(1);
  });

  it('keeps a number box between its limits, and empty stays empty', () => {
    const limits = numberLimits({ min: 0, max: 10, step: 1 }, false);
    expect(fitNumber(15, limits, false)).toBe(10);
    expect(fitNumber(-3, limits, false)).toBe(0);
    expect(fitNumber(2.75, limits, false)).toBe(2.75); // the step only applies to the arrows
    expect(fitNumber('', limits, false)).toBe('');
    expect(fitNumber('7', limits, false)).toBe(7);
    expect(fitNumber(1e9, numberLimits({}, false), false)).toBe(1e9);
  });

  it('puts a slider on a step between its ends, starting at the smallest when unset', () => {
    const limits = numberLimits({ min: 0, max: 1, step: 0.1 }, true);
    expect(fitNumber(0.33, limits, true)).toBe(0.3);
    expect(fitNumber(0.1 + 0.2, limits, true)).toBe(0.3);
    expect(fitNumber(4, limits, true)).toBe(1);
    expect(fitNumber('', limits, true)).toBe(0);
    expect(fitNumber(7, numberLimits({ min: 1, max: 10, step: 3 }, true), true)).toBe(7);
    expect(fitNumber(8, numberLimits({ min: 1, max: 10, step: 3 }, true), true)).toBe(7);
  });

  it('start with sensible settings', () => {
    const slider = defaultProps('slider');
    expect(slider.value).toEqual({ kind: 'static', value: 50 });
    expect(slider.showValue).toEqual({ kind: 'static', value: true });
    expect(defaultProps('number').value).toEqual({ kind: 'static', value: '' });
  });

  it('stay out of List cards, like text boxes', () => {
    const project = makeProject();
    const list = makeElement('list', 'People');
    project.screens[0].root.children.push(list);
    expect(canPlaceInside(project.screens[0].root, list.id, 'number')).toBe(false);
    expect(canPlaceInside(project.screens[0].root, list.id, 'slider')).toBe(false);
  });
});
