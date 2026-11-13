import type { CSSProperties } from 'react';
import { toNumber, toText } from '@code-blocks/engine/convert';

/** Shadow choices, from none to strong. */
export const SHADOWS: Record<string, string | undefined> = {
  none: undefined,
  soft: '0 1px 3px rgba(15, 23, 42, 0.14)',
  medium: '0 4px 14px rgba(15, 23, 42, 0.16)',
  strong: '0 12px 32px rgba(15, 23, 42, 0.24)',
};

/** Font choices. An empty choice keeps the font of the box around the element. */
export const FONTS: Record<string, string | undefined> = {
  '': undefined,
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace",
  rounded: "ui-rounded, 'Segoe UI Rounded', 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif",
  handwriting: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive",
};

/** A size in pixels, or undefined when it's left empty (automatic). */
function px(v: unknown, zeroIsAuto: boolean): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = toNumber(v);
  if (n < 0 || (zeroIsAuto && n === 0)) return undefined;
  return n;
}

/**
 * The size, spacing and look settings every element shares, as CSS. Empty
 * settings are left out, so the element keeps its usual look. The screen
 * itself only takes a font: its size and spacing come from the device frame.
 */
export function elementStyle(p: Record<string, unknown>, isRoot = false): CSSProperties {
  const style: CSSProperties = {};
  const font = FONTS[toText(p.font)];
  if (font) style.fontFamily = font;
  if (isRoot) return style;
  const width = px(p.width, true);
  const height = px(p.height, true);
  const margin = px(p.margin, false);
  const radius = px(p.radius, false);
  const shadow = SHADOWS[toText(p.shadow)];
  if (width !== undefined) {
    style.width = width;
    // A fixed width doesn't stretch or shrink in a row.
    style.flex = 'none';
  }
  if (height !== undefined) style.height = height;
  if (margin !== undefined) style.margin = margin;
  if (radius !== undefined) style.borderRadius = radius;
  if (shadow) style.boxShadow = shadow;
  return style;
}

/** True when the element has a width set, so it shouldn't fill a row. */
export const hasFixedWidth = (p: Record<string, unknown>) => px(p.width, true) !== undefined;
