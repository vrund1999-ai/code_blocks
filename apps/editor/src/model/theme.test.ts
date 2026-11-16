import { beforeEach, describe, expect, it } from 'vitest';
import { makeProject } from './factory';
import { useProjectStore } from './projectStore';
import { contrast, DEFAULT_THEME, fullTheme, readable, textOn, THEME_PRESETS, themeStyle } from './theme';

describe('the app theme', () => {
  it('fills in what a theme leaves out with the usual look, and ignores settings that aren’t valid', () => {
    expect(fullTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(fullTheme({ accent: '#0B7285', text: 'red', font: 'comic', corners: 'round' })).toEqual({
      ...DEFAULT_THEME,
      accent: '#0b7285',
      corners: 'round',
    });
  });

  it('works out contrast as WCAG does, and picks a readable label for buttons', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(textOn('#5b5bd6')).toBe('#ffffff');
    // A yellow button gets a dark label.
    expect(textOn('#ffd43b')).toBe('#111111');
  });

  it('turns a theme into CSS variables, with lighter fields and lines on a dark background', () => {
    const light = themeStyle(undefined) as Record<string, string>;
    expect(light).toMatchObject({ '--app-accent': '#5b5bd6', '--app-on-accent': '#ffffff', '--app-radius': '8px', '--app-field': '#ffffff', colorScheme: 'light' });
    const night = THEME_PRESETS.find((p) => p.id === 'night')!.theme;
    const dark = themeStyle(night) as Record<string, string>;
    expect(dark).toMatchObject({ background: night.background, color: night.text, colorScheme: 'dark' });
    expect(dark['--app-field']).toMatch(/^rgba\(255, 255, 255/);
    expect((themeStyle({ corners: 'square' }) as Record<string, string>)['--app-card-radius']).toBe('0px');
  });

  it('has presets whose text is easy to read, and warns when a theme’s isn’t', () => {
    for (const p of THEME_PRESETS) expect(readable(p.theme), p.name).toBe(true);
    for (const p of THEME_PRESETS) expect(contrast(textOn(p.theme.accent), p.theme.accent), `${p.name} button`).toBeGreaterThanOrEqual(4.5);
    // Links and outlined buttons are drawn in the main colour, on the background.
    for (const p of THEME_PRESETS) expect(contrast(p.theme.accent, p.theme.background), `${p.name} link`).toBeGreaterThanOrEqual(4.5);
    expect(readable({ text: '#cccccc', background: '#ffffff' })).toBe(false);
  });
});

describe('setTheme', () => {
  beforeEach(() => useProjectStore.getState().loadProject(makeProject('Test')));
  const theme = () => useProjectStore.getState().project.theme;

  it('changes settings one at a time, and can be undone', () => {
    const { setTheme, undo } = useProjectStore.getState();
    setTheme({ accent: '#2b8a3e' });
    setTheme({ font: 'serif' });
    expect(theme()).toEqual({ accent: '#2b8a3e', font: 'serif' });
    // Changes in quick succession (dragging in a colour picker) are one step.
    undo();
    expect(theme()).toBeUndefined();
  });

  it('leaves no theme in the project for the usual look', () => {
    const { setTheme } = useProjectStore.getState();
    setTheme({ accent: '#2b8a3e' });
    setTheme({ accent: undefined });
    expect(theme()).toBeUndefined();
    setTheme({ ...THEME_PRESETS[1].theme });
    setTheme(null);
    expect('theme' in useProjectStore.getState().project).toBe(false);
  });
});
