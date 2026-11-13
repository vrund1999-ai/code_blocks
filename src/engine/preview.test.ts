import { describe, expect, it } from 'vitest';
import { previewValue } from './preview';

const short = (v: unknown) => previewValue(v).short;

describe('previewValue', () => {
  it('shows text in quotes, shortened to fit a label', () => {
    expect(short('Ada')).toBe('“Ada”');
    expect(short('')).toBe('empty text');
    expect(short('one\ntwo')).toBe('“one ⏎ two”');
    const long = 'The quick brown fox jumps over the lazy dog';
    expect(short(long)).toBe('“The quick brown fox j…”');
    expect(previewValue(long).full).toBe(long);
  });

  it('shows numbers, yes / no and missing values plainly', () => {
    expect(short(42)).toBe('42');
    expect(short(0.1 + 0.2)).toBe('0.3');
    expect(short(true)).toBe('yes');
    expect(short(false)).toBe('no');
    expect(short(undefined)).toBe('nothing');
    expect(short(null)).toBe('nothing');
  });

  it('sums up lists and records, with the whole value in the tooltip', () => {
    expect(short([])).toBe('empty list');
    expect(short(['a'])).toBe('list of 1 item');
    expect(short([1, 2, 3])).toBe('list of 3 items');
    expect(short({ name: 'Ada', city: 'London' })).toBe('{name, city}');
    expect(short({ firstName: 1, lastName: 2, birthday: 3 })).toBe('record, 3 fields');
    expect(short({})).toBe('empty record');
    expect(previewValue({ name: 'Ada' }).full).toBe('{\n  "name": "Ada"\n}');
  });
});
