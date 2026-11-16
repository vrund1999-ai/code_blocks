// The app-wide theme: its colours, font and corners, and how they reach the
// rendered app (as CSS variables on the app's outermost element).

import type { CSSProperties } from 'react';
import type { Theme } from './types';
import { FONTS } from './style';

export type { Theme };

/** The usual look, which a theme's empty settings fall back to. */
export const DEFAULT_THEME: Required<Theme> = {
  accent: '#5b5bd6',
  background: '#ffffff',
  text: '#1f2937',
  font: 'sans',
  corners: 'usual',
};

/** Ready-made themes to start from. */
export const THEME_PRESETS: { id: string; name: string; theme: Required<Theme> }[] = [
  { id: 'classic', name: 'Classic', theme: DEFAULT_THEME },
  { id: 'ocean', name: 'Ocean', theme: { accent: '#0b7285', background: '#f1f8fa', text: '#123a44', font: 'sans', corners: 'round' } },
  { id: 'forest', name: 'Forest', theme: { accent: '#237032', background: '#f6faf3', text: '#1e3320', font: 'rounded', corners: 'round' } },
  { id: 'sunset', name: 'Sunset', theme: { accent: '#c2410c', background: '#fff8f0', text: '#3d2314', font: 'serif', corners: 'usual' } },
  { id: 'night', name: 'Night', theme: { accent: '#9775fa', background: '#1a1b26', text: '#e9e9f2', font: 'sans', corners: 'usual' } },
  { id: 'paper', name: 'Paper', theme: { accent: '#343a40', background: '#fdfdfb', text: '#212529', font: 'mono', corners: 'square' } },
];

/** Corner choices, in pixels for fields and buttons (cards and frames use a little more). */
export const CORNERS: Record<NonNullable<Theme['corners']>, number> = { square: 0, usual: 8, round: 16 };

export const CORNER_OPTIONS = [
  { value: 'square', label: 'Square' },
  { value: 'usual', label: 'Slightly rounded' },
  { value: 'round', label: 'Round' },
] as const;

const HEX = /^#[0-9a-f]{6}$/i;

/** A theme with every setting filled in; settings that aren't valid fall back to the usual look. */
export function fullTheme(theme: Theme | undefined): Required<Theme> {
  const t = theme ?? {};
  const pick = (v: string | undefined, fallback: string) => (v && HEX.test(v) ? v.toLowerCase() : fallback);
  return {
    accent: pick(t.accent, DEFAULT_THEME.accent),
    background: pick(t.background, DEFAULT_THEME.background),
    text: pick(t.text, DEFAULT_THEME.text),
    font: t.font && FONTS[t.font] ? t.font : DEFAULT_THEME.font,
    corners: t.corners && t.corners in CORNERS ? t.corners : DEFAULT_THEME.corners,
  };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** How light a colour looks, from 0 (black) to 1 (white), as in the WCAG contrast formula. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast between two colours, from 1 (the same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on the colour (for a button's label). */
export function textOn(hex: string): string {
  return contrast(hex, '#ffffff') >= contrast(hex, '#111111') ? '#ffffff' : '#111111';
}

/** Is the background dark, so fields and lines need light colours? */
export const isDark = (hex: string) => luminance(hex) < 0.2;

/**
 * The theme as CSS variables for the app's outermost element. The app's CSS
 * uses them (with the usual look as fallback), and elements' own colours win.
 */
export function themeStyle(theme: Theme | undefined): CSSProperties {
  const t = fullTheme(theme);
  const dark = isDark(t.background);
  const radius = CORNERS[t.corners];
  return {
    ['--app-accent' as string]: t.accent,
    ['--app-on-accent' as string]: textOn(t.accent),
    ['--app-bg' as string]: t.background,
    ['--app-text' as string]: t.text,
    // Fields, cards and lines: a little lighter or darker than the background.
    ['--app-field' as string]: dark ? 'rgba(255, 255, 255, 0.07)' : '#ffffff',
    ['--app-line' as string]: dark ? 'rgba(255, 255, 255, 0.18)' : '#ced4da',
    ['--app-soft-line' as string]: dark ? 'rgba(255, 255, 255, 0.1)' : '#e3e5e8',
    ['--app-hover' as string]: dark ? 'rgba(255, 255, 255, 0.06)' : '#f8f9fa',
    ['--app-radius' as string]: `${radius}px`,
    ['--app-card-radius' as string]: `${radius === 0 ? 0 : radius + 2}px`,
    fontFamily: FONTS[t.font],
    color: t.text,
    background: t.background,
    colorScheme: dark ? 'dark' : 'light',
  };
}

/** Does the text colour read well enough on the background (WCAG AA for normal text)? */
export const readable = (theme: Theme | undefined) => {
  const t = fullTheme(theme);
  return contrast(t.text, t.background) >= 4.5;
};
