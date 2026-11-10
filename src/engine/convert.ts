// Forgiving value conversions so non-technical users rarely hit type errors.

export function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(toText).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return v.length;
  const n = parseFloat(toText(v));
  return Number.isFinite(n) ? n : 0;
}

export function toBool(v: unknown): boolean {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return !(s === '' || s === 'false' || s === 'no' || s === '0');
  }
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

export function toList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === '') return [];
  return [v];
}

/** Equality that treats "5" and 5 as equal, like people expect. */
export function looseEquals(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    const ta = toText(a).trim();
    const tb = toText(b).trim();
    if (ta !== '' && tb !== '' && !isNaN(Number(ta)) && !isNaN(Number(tb))) {
      return Number(ta) === Number(tb);
    }
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return toBool(a) === toBool(b);
  return toText(a) === toText(b);
}
