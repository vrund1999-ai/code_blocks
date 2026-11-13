import { isRecord } from './convert';

const SHORT = 24;
const FULL = 600;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * How a value is shown on a wire while the app runs: `short` fits in a small
 * label, `full` is the whole value for a tooltip.
 */
export function previewValue(v: unknown): { short: string; full: string } {
  if (v === undefined || v === null) return { short: 'nothing', full: 'Nothing (no value)' };
  if (typeof v === 'string') {
    if (v === '') return { short: 'empty text', full: 'Empty text' };
    // Show line breaks as ⏎ so the label stays on one line.
    return { short: `“${clip(v.replace(/\r?\n/g, ' ⏎ '), SHORT - 2)}”`, full: clip(v, FULL) };
  }
  if (typeof v === 'boolean') return { short: v ? 'yes' : 'no', full: v ? 'Yes' : 'No' };
  if (typeof v === 'number') {
    const s = Number.isFinite(v) ? String(Number.isInteger(v) ? v : Number(v.toPrecision(10))) : '0';
    return { short: clip(s, SHORT), full: s };
  }
  if (Array.isArray(v)) {
    return {
      short: v.length === 0 ? 'empty list' : `list of ${plural(v.length, 'item', 'items')}`,
      full: clip(json(v), FULL),
    };
  }
  if (isRecord(v)) {
    const keys = Object.keys(v);
    const names = keys.join(', ');
    return {
      short: keys.length === 0 ? 'empty record' : names.length <= SHORT - 2 ? `{${names}}` : `record, ${plural(keys.length, 'field', 'fields')}`,
      full: clip(json(v), FULL),
    };
  }
  return { short: clip(String(v), SHORT), full: clip(String(v), FULL) };
}

function json(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
