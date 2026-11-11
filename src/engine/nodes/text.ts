// Text blocks: change, search, split and replace text.

import { toBool, toText } from '../convert';
import type { NodeDef, Pin } from '../types';

const quote = (v: unknown, fallback = '…') => {
  const t = toText(v);
  return t === '' ? fallback : `“${t}”`;
};

const textIn: Pin = { id: 'text', label: 'Text', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } };

/** Capitalises the first letter of every word and lowercases the rest. */
export function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s\-‐(“"'])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/**
 * Splits text into a list at every `separator`, trimming spaces around each
 * piece. An empty separator splits into single characters.
 */
export function splitText(text: string, separator: string): string[] {
  if (text === '') return [];
  if (separator === '') return [...text];
  return text.split(separator).map((p) => p.trim());
}

const CASES: Record<string, { label: string; sentence: string; apply: (t: string) => string }> = {
  upper: { label: 'UPPERCASE', sentence: 'Text in UPPERCASE', apply: (t) => t.toUpperCase() },
  lower: { label: 'lowercase', sentence: 'Text in lowercase', apply: (t) => t.toLowerCase() },
  title: { label: 'Capital For Each Word', sentence: 'Text With Capitals', apply: titleCase },
  trim: { label: 'Remove spaces at the ends', sentence: 'Text without spaces at the ends', apply: (t) => t.trim() },
};

const MATCHES: Record<string, { label: string; sentence: string; test: (text: string, part: string) => boolean }> = {
  contains: { label: 'contains', sentence: 'contains', test: (t, p) => t.includes(p) },
  starts: { label: 'starts with', sentence: 'starts with', test: (t, p) => t.startsWith(p) },
  ends: { label: 'ends with', sentence: 'ends with', test: (t, p) => t.endsWith(p) },
};

export const textNodes: NodeDef[] = [
  {
    type: 'text.case',
    category: 'text',
    label: 'Change text',
    description: 'Makes text UPPERCASE, lowercase or Capital For Each Word, or removes spaces at the ends.',
    inputs: [textIn],
    outputs: [{ id: 'value', label: 'Result', kind: 'data', valueType: 'text' }],
    configFields: [
      {
        key: 'op',
        label: 'Make it',
        type: 'select',
        default: 'upper',
        options: Object.entries(CASES).map(([value, c]) => ({ value, label: c.label })),
      },
    ],
    sentence: (c) => (CASES[String(c.op)] ?? CASES.upper).sentence,
    async evaluate(ctx) {
      const op = CASES[String(ctx.config.op)] ?? CASES.upper;
      return { value: op.apply(toText(await ctx.input('text'))) };
    },
  },
  {
    type: 'text.contains',
    category: 'text',
    label: 'Text contains',
    description: 'Checks whether text contains, starts with or ends with another piece of text.',
    inputs: [
      textIn,
      { id: 'part', label: 'Look for', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
    ],
    outputs: [{ id: 'value', label: 'Is true', kind: 'data', valueType: 'boolean' }],
    configFields: [
      {
        key: 'op',
        label: 'Check',
        type: 'select',
        default: 'contains',
        options: Object.entries(MATCHES).map(([value, m]) => ({ value, label: m.label })),
      },
      { key: 'matchCase', label: 'Capitals must match', type: 'boolean', default: false },
    ],
    sentence: (c) => `Text ${(MATCHES[String(c.op)] ?? MATCHES.contains).sentence} ${quote(c.part)}`,
    async evaluate(ctx) {
      const match = MATCHES[String(ctx.config.op)] ?? MATCHES.contains;
      let text = toText(await ctx.input('text'));
      let part = toText(await ctx.input('part'));
      if (!toBool(ctx.config.matchCase)) {
        text = text.toLowerCase();
        part = part.toLowerCase();
      }
      return { value: match.test(text, part) };
    },
  },
  {
    type: 'text.length',
    category: 'text',
    label: 'Text length',
    description: 'How many characters (letters, digits, spaces…) are in a piece of text.',
    inputs: [textIn],
    outputs: [{ id: 'value', label: 'Length', kind: 'data', valueType: 'number' }],
    configFields: [],
    sentence: () => 'Number of characters',
    async evaluate(ctx) {
      return { value: [...toText(await ctx.input('text'))].length };
    },
  },
  {
    type: 'text.replace',
    category: 'text',
    label: 'Replace text',
    description: 'Replaces every place a piece of text appears with something else.',
    inputs: [
      textIn,
      { id: 'find', label: 'Find', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
      { id: 'with', label: 'Replace with', kind: 'data', valueType: 'text', inline: { type: 'text', default: '' } },
    ],
    outputs: [{ id: 'value', label: 'Result', kind: 'data', valueType: 'text' }],
    configFields: [],
    sentence: (c) => `Replace ${quote(c.find)} with ${quote(c.with, 'nothing')}`,
    async evaluate(ctx) {
      const text = toText(await ctx.input('text'));
      const find = toText(await ctx.input('find'));
      const replacement = toText(await ctx.input('with'));
      return { value: find === '' ? text : text.split(find).join(replacement) };
    },
  },
  {
    type: 'text.split',
    category: 'text',
    label: 'Split text',
    description: 'Cuts text into a list at every separator, such as a comma.',
    inputs: [
      textIn,
      { id: 'separator', label: 'Split at', kind: 'data', valueType: 'text', inline: { type: 'text', default: ',' } },
    ],
    outputs: [{ id: 'value', label: 'List', kind: 'data', valueType: 'list' }],
    configFields: [],
    sentence: (c) => `Split text at ${quote(c.separator ?? ',', 'every character')}`,
    async evaluate(ctx) {
      return { value: splitText(toText(await ctx.input('text')), toText(await ctx.input('separator'))) };
    },
  },
];
