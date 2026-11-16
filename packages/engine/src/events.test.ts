import { describe, expect, it } from 'vitest';
import { getNodeDef } from './registry';
import { KEY_OPTIONS, keyMatches, keyName } from './nodes/events';

const names = {
  element: (id: unknown) => (id === 'list1' ? 'People' : id === 'btn1' ? 'Help' : undefined),
  variable: () => undefined,
  screen: () => undefined,
  inList: (id: unknown) => id === 'btn1',
};

describe('key presses', () => {
  it('go by lowercase letters, Space, and the browser’s names for other keys', () => {
    expect(keyName('A')).toBe('a');
    expect(keyName('7')).toBe('7');
    expect(keyName(' ')).toBe('Space');
    expect(keyName('Spacebar')).toBe('Space');
    expect(keyName('Esc')).toBe('Escape');
    expect(keyName('ArrowUp')).toBe('ArrowUp');
    expect(keyName('Enter')).toBe('Enter');
  });

  it('match the block’s key, or any key', () => {
    expect(keyMatches('Enter', 'Enter')).toBe(true);
    expect(keyMatches('Enter', 'a')).toBe(false);
    expect(keyMatches('any', 'a')).toBe(true);
    expect(keyMatches(undefined, 'a')).toBe(true);
  });

  it('can be any letter, digit or common key, each offered once', () => {
    const values = KEY_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    for (const k of ['any', 'Enter', 'Space', 'Escape', 'ArrowLeft', 'w', 'z', '0', '9']) expect(values).toContain(k);
  });
});

describe('the new event blocks', () => {
  it('read as sentences', () => {
    const key = getNodeDef('event.keyPress')!;
    expect(key.sentence!({ key: 'any' }, names)).toBe('When any key is pressed');
    expect(key.sentence!({ key: 'ArrowUp' }, names)).toBe('When Up arrow is pressed');
    expect(key.sentence!({ key: 'w' }, names)).toBe('When W is pressed');
    expect(getNodeDef('event.cardClick')!.sentence!({ element: 'list1' }, names)).toBe('When an item in “People” is clicked');
    const hover = getNodeDef('event.hover')!;
    expect(hover.sentence!({ element: 'btn1' }, names)).toBe('When the mouse moves onto “Help”');
    expect(hover.sentence!({ element: 'btn1', action: 'leave' }, names)).toBe('When the mouse moves off “Help”');
  });

  it('ask for the element they listen to, but a key block works as it comes', () => {
    expect(getNodeDef('event.cardClick')!.validate!({})).toBe('Pick which list this listens to.');
    expect(getNodeDef('event.hover')!.validate!({})).toBe('Pick which element this listens to.');
    expect(getNodeDef('event.keyPress')!.validate).toBeUndefined();
  });

  it('give a card’s item when the element is in a List’s card', () => {
    const hover = getNodeDef('event.hover')!;
    expect(hover.dynamicOutputs!({ element: 'btn1' }, names).map((p) => p.id)).toEqual(['item', 'index']);
    expect(hover.dynamicOutputs!({ element: 'other' }, names)).toEqual([]);
  });
});
