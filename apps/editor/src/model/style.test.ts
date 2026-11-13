import { describe, expect, it } from 'vitest';
import { ELEMENT_DEFS, defaultProps } from './elements';
import { FONTS, SHADOWS, elementStyle, hasFixedWidth } from './style';

describe('elementStyle', () => {
  it('leaves everything out when the settings are empty', () => {
    expect(elementStyle({ width: '', height: '', margin: '', radius: '', shadow: 'none', font: '' })).toEqual({});
    // Older projects don't have the settings at all.
    expect(elementStyle({})).toEqual({});
  });

  it('turns sizes, spacing and look into CSS', () => {
    expect(
      elementStyle({ width: 120, height: '48', margin: 0, radius: 16, shadow: 'medium', font: 'serif' }),
    ).toEqual({
      width: 120,
      flex: 'none',
      height: 48,
      margin: 0,
      borderRadius: 16,
      boxShadow: SHADOWS.medium,
      fontFamily: FONTS.serif,
    });
  });

  it('treats a width or height of 0, negative sizes and unknown choices as automatic', () => {
    expect(elementStyle({ width: 0, height: 0, margin: -4, radius: -1, shadow: 'huge', font: 'comic' })).toEqual({});
    expect(hasFixedWidth({ width: 0 })).toBe(false);
    expect(hasFixedWidth({ width: '' })).toBe(false);
    expect(hasFixedWidth({ width: 200 })).toBe(true);
  });

  it('only gives the screen itself a font', () => {
    expect(elementStyle({ width: 100, margin: 8, shadow: 'strong', font: 'mono' }, true)).toEqual({
      fontFamily: FONTS.mono,
    });
  });
});

describe('style settings on elements', () => {
  it('every element has them, before Visible, with empty defaults', () => {
    for (const def of Object.values(ELEMENT_DEFS)) {
      const keys = def.fields.map((f) => f.key);
      expect(keys.slice(-7)).toEqual(['width', 'height', 'margin', 'radius', 'shadow', 'font', 'visible']);
      expect(keys.filter((k) => k === 'width')).toHaveLength(1);
      expect(defaultProps(def.type).shadow).toEqual({ kind: 'static', value: 'none' });
    }
  });

  it('an image keeps its usual width of 200', () => {
    expect(defaultProps('image').width).toEqual({ kind: 'static', value: 200 });
    expect(defaultProps('button').width).toEqual({ kind: 'static', value: '' });
  });
});
