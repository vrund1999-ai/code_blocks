// Forgiving value conversions so non-technical users rarely hit type errors.

export type Rec = Record<string, unknown>;

/** A record is a plain object with named fields (not a list). */
export function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(toText).join(', ');
  if (isRecord(v)) {
    // "name: Ada, age: 36". Records inside records go in brackets.
    return Object.entries(v)
      .map(([k, x]) => `${k}: ${isRecord(x) ? `(${toText(x)})` : toText(x)}`)
      .join(', ');
  }
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
  if (isRecord(v)) return Object.keys(v).length > 0;
  return Boolean(v);
}

export function toList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === '') return [];
  return [v];
}

/** Anything that is not a record becomes an empty record. */
export function toRecord(v: unknown): Rec {
  return isRecord(v) ? v : {};
}

/**
 * Finds a field by name. An exact match wins; otherwise case and
 * surrounding spaces are ignored, so "Name" finds "name".
 */
export function findField(rec: Rec, name: string): string | undefined {
  if (Object.hasOwn(rec, name)) return name;
  const want = name.trim().toLowerCase();
  if (want === '') return undefined;
  return Object.keys(rec).find((k) => k.trim().toLowerCase() === want);
}

/** True for '', empty lists and records with no fields. */
export function isEmptyValue(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (isRecord(v)) return Object.keys(v).length === 0;
  return toText(v).trim() === '';
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
