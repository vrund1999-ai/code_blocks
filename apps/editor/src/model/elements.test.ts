import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dateInputValue,
  dateLimits,
  defaultProps,
  dropdownChoices,
  fitDate,
  fitNumber,
  linkHref,
  numberLimits,
  pickerDate,
} from './elements';
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

describe('link addresses', () => {
  it('opens web pages, emails and phone numbers', () => {
    expect(linkHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(linkHref('HTTP://example.com')).toBe('HTTP://example.com');
    expect(linkHref('mailto:hello@example.com')).toBe('mailto:hello@example.com');
    expect(linkHref('tel:+15551234')).toBe('tel:+15551234');
  });

  it('adds https:// to an address without it', () => {
    expect(linkHref(' example.com/menu ')).toBe('https://example.com/menu');
    expect(linkHref('//example.com')).toBe('https://example.com');
  });

  it('refuses addresses that could run code, and empty or odd ones', () => {
    expect(linkHref('javascript:alert(1)')).toBeUndefined();
    expect(linkHref(' JavaScript:alert(1)')).toBeUndefined();
    expect(linkHref('data:text/html,<b>hi</b>')).toBeUndefined();
    expect(linkHref('')).toBeUndefined();
    expect(linkHref(undefined)).toBeUndefined();
    expect(linkHref('two words')).toBeUndefined();
  });
});

describe('date pickers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15, 14, 30));
  });
  afterEach(() => vi.useRealTimers());

  it('keep a date, with a time only when they pick one', () => {
    expect(pickerDate('2026-1-5', false)).toBe('2026-01-05');
    expect(pickerDate('2026-11-15 14:30', false)).toBe('2026-11-15');
    expect(pickerDate('2026-11-15', true)).toBe('2026-11-15 00:00');
    // What the browser's date and time input gives.
    expect(pickerDate('2026-11-15T14:30', true)).toBe('2026-11-15 14:30');
    expect(pickerDate('15/11/2026', false)).toBe('');
    expect(pickerDate('', false)).toBe('');
  });

  it('read “today” as the day the app runs', () => {
    expect(pickerDate('today', false)).toBe('2026-11-15');
    expect(pickerDate(' Today ', true)).toBe('2026-11-15 00:00');
  });

  it('keep a date between the earliest and latest, set either way round', () => {
    const limits = dateLimits({ min: '2026-12-31', max: 'today' });
    expect(limits).toEqual({ withTime: false, min: '2026-11-15', max: '2026-12-31' });
    expect(fitDate('2026-11-01', limits)).toBe('2026-11-15');
    expect(fitDate('2027-01-01', limits)).toBe('2026-12-31');
    expect(fitDate('2026-12-01', limits)).toBe('2026-12-01');
    expect(fitDate('', limits)).toBe('');
    const timed = dateLimits({ withTime: true, min: 'today' });
    expect(fitDate('2026-11-14 23:00', timed)).toBe('2026-11-15 00:00');
    expect(fitDate('2026-11-15 09:00', timed)).toBe('2026-11-15 09:00');
  });

  it('give the browser’s input its own form', () => {
    expect(dateInputValue('2026-11-15 14:30')).toBe('2026-11-15T14:30');
    expect(dateInputValue('2026-11-15')).toBe('2026-11-15');
  });

  it('start with nothing picked, and stay out of List cards', () => {
    expect(defaultProps('date').value).toEqual({ kind: 'static', value: '' });
    expect(defaultProps('date').withTime).toEqual({ kind: 'static', value: false });
    const project = makeProject();
    const list = makeElement('list', 'People');
    project.screens[0].root.children.push(list);
    expect(canPlaceInside(project.screens[0].root, list.id, 'date')).toBe(false);
  });
});
