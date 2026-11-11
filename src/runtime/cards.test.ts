import { describe, expect, it } from 'vitest';
import { cardValue } from './cards';

describe('cardValue', () => {
  const card = (item: unknown, sample = false) => ({ item, index: 1, sample });

  it('reads a field of a record item, ignoring case and spaces', () => {
    expect(cardValue(card({ name: 'Ada', age: 36 }), 'name')).toBe('Ada');
    expect(cardValue(card({ name: 'Ada' }), ' Name ')).toBe('Ada');
    expect(cardValue(card({ name: 'Ada' }), 'city')).toBeUndefined();
  });

  it('gives the whole item when no field is named', () => {
    expect(cardValue(card('Buy milk'), '')).toBe('Buy milk');
    expect(cardValue(card({ a: 1 }), '  ')).toEqual({ a: 1 });
  });

  it('is unset outside a card', () => {
    expect(cardValue(null, 'name')).toBeUndefined();
  });

  it('names the field in the designer when there is no sample data', () => {
    expect(cardValue(card(undefined, true), 'name')).toBe('‹name›');
    expect(cardValue(card({ name: '' }, true), 'name')).toBe('‹name›');
    expect(cardValue(card(undefined, true), '')).toBe('‹item›');
    expect(cardValue(card({ name: 'Ada' }, true), 'name')).toBe('Ada');
  });
});
