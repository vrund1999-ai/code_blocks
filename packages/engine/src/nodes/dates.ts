// Date and time blocks. Dates are plain text, like 2026-11-15 or
// 2026-11-15 14:30, so they read well, sort in order, and can be stored in a
// table or typed into a block. They are wall-clock times with no time zone:
// "now" is the time on the device (or the server) running the app.

import { toNumber, toText } from '../convert';
import { GraphError, type NodeDef, type Pin } from '../types';

/** A date, with a time of day when `hasTime` is set. */
export interface DateValue {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  hasTime: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Milliseconds for the wall-clock time, counted as if it were UTC (no daylight saving jumps). */
const toMs = (d: DateValue) => Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute, d.second);

function fromMs(ms: number, hasTime: boolean): DateValue {
  const t = new Date(ms);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
    hour: hasTime ? t.getUTCHours() : 0,
    minute: hasTime ? t.getUTCMinutes() : 0,
    second: hasTime ? t.getUTCSeconds() : 0,
    hasTime,
  };
}

/** The date and time now, on the clock of whoever runs the app. */
export function now(hasTime = true): DateValue {
  const t = new Date();
  return {
    year: t.getFullYear(),
    month: t.getMonth() + 1,
    day: t.getDate(),
    hour: hasTime ? t.getHours() : 0,
    minute: hasTime ? t.getMinutes() : 0,
    second: hasTime ? t.getSeconds() : 0,
    hasTime,
  };
}

const DATE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/** Reads a date written like 2026-11-15 or 2026-11-15 14:30, or null if it isn't one. */
export function parseDate(text: string): DateValue | null {
  const m = DATE_PATTERN.exec(text.trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [hour, minute, second] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { year, month, day, hour, minute, second, hasTime: m[4] !== undefined };
}

/** Writes a date the way the blocks pass it on: 2026-11-15, or 2026-11-15 14:30 with a time. */
export function writeDate(d: DateValue): string {
  const date = `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`;
  if (!d.hasTime) return date;
  return `${date} ${pad(d.hour)}:${pad(d.minute)}${d.second ? `:${pad(d.second)}` : ''}`;
}

/** Adds an amount of a unit; months and years keep the day, or use the month's last day. */
export function addToDate(d: DateValue, amount: number, unit: string): DateValue {
  const whole = Math.trunc(amount);
  if (unit === 'months' || unit === 'years') {
    const total = d.year * 12 + (d.month - 1) + (unit === 'years' ? whole * 12 : whole);
    const year = Math.floor(total / 12);
    const month = total - year * 12 + 1;
    return { ...d, year, month, day: Math.min(d.day, daysInMonth(year, month)) };
  }
  const ms = { minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 }[unit] ?? 86_400_000;
  const timeUnit = unit === 'minutes' || unit === 'hours';
  return fromMs(toMs(d) + whole * ms, d.hasTime || timeUnit);
}

/** Whole units from `from` to `to`; negative when `to` comes first. */
export function timeBetween(from: DateValue, to: DateValue, unit: string): number {
  if (unit === 'months' || unit === 'years') {
    let months = (to.year - from.year) * 12 + (to.month - from.month);
    // Not a whole month yet, such as from the 20th to the 10th of the next month.
    if (months > 0 && toMs(addToDate(from, months, 'months')) > toMs(to)) months--;
    if (months < 0 && toMs(addToDate(from, months, 'months')) < toMs(to)) months++;
    return Math.trunc(unit === 'years' ? months / 12 : months);
  }
  const ms = { minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 }[unit] ?? 86_400_000;
  return Math.trunc((toMs(to) - toMs(from)) / ms) || 0;
}

const hour12 = (d: DateValue) => `${d.hour % 12 || 12}:${pad(d.minute)} ${d.hour < 12 ? 'AM' : 'PM'}`;
const weekday = (d: DateValue) => WEEKDAYS[new Date(toMs(d)).getUTCDay()];

const FORMATS: Record<string, { label: string; show: (d: DateValue) => string }> = {
  long: { label: '15 November 2026', show: (d) => `${d.day} ${MONTHS[d.month - 1]} ${d.year}` },
  full: { label: 'Sunday 15 November 2026', show: (d) => `${weekday(d)} ${d.day} ${MONTHS[d.month - 1]} ${d.year}` },
  us: { label: 'November 15, 2026', show: (d) => `${MONTHS[d.month - 1]} ${d.day}, ${d.year}` },
  dmy: { label: '15/11/2026', show: (d) => `${pad(d.day)}/${pad(d.month)}/${d.year}` },
  mdy: { label: '11/15/2026', show: (d) => `${pad(d.month)}/${pad(d.day)}/${d.year}` },
  time12: { label: '2:30 PM', show: hour12 },
  time24: { label: '14:30', show: (d) => `${pad(d.hour)}:${pad(d.minute)}` },
  longTime: { label: '15 November 2026, 2:30 PM', show: (d) => `${d.day} ${MONTHS[d.month - 1]} ${d.year}, ${hour12(d)}` },
};

const PARTS: Record<string, { label: string; get: (d: DateValue) => string | number }> = {
  year: { label: 'year', get: (d) => d.year },
  month: { label: 'month, as a number', get: (d) => d.month },
  monthName: { label: 'name of the month', get: (d) => MONTHS[d.month - 1] },
  day: { label: 'day of the month', get: (d) => d.day },
  weekday: { label: 'day of the week', get: weekday },
  hour: { label: 'hour', get: (d) => d.hour },
  minute: { label: 'minute', get: (d) => d.minute },
};

const UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'];
const unitField = (label: string, def: string) => ({
  key: 'unit',
  label,
  type: 'select' as const,
  default: def,
  options: UNITS.map((u) => ({ value: u, label: u })),
});

/** A date input: empty means today (or now, for minutes and hours). */
const dateIn = (id: string, label: string): Pin => ({
  id,
  label,
  kind: 'data',
  valueType: 'text',
  inline: { type: 'text', default: '', placeholder: 'today' },
});

async function readDate(ctx: { node: { id: string }; input(pin: string): Promise<unknown> }, pin: string, withTime: boolean): Promise<DateValue> {
  const text = toText(await ctx.input(pin)).trim();
  if (text === '') return now(withTime);
  const d = parseDate(text);
  if (!d) throw new GraphError(ctx.node.id, `“${text}” isn’t a date. Write dates like 2026-11-15, or 2026-11-15 14:30 with a time.`);
  return d;
}

const NOWS: Record<string, { label: string; sentence: string; show: () => string }> = {
  date: { label: 'today’s date', sentence: 'Today’s date', show: () => writeDate(now(false)) },
  dateTime: { label: 'the date and time', sentence: 'The date and time now', show: () => writeDate(now(true)) },
  time: { label: 'the time', sentence: 'The time now', show: () => FORMATS.time24.show(now(true)) },
};

const COMPARES: Record<string, { label: string; test: (a: number, b: number) => boolean }> = {
  before: { label: 'is before', test: (a, b) => a < b },
  after: { label: 'is after', test: (a, b) => a > b },
  same: { label: 'is the same day as', test: (a, b) => a === b },
};

const dayOnly = (d: DateValue): DateValue => ({ ...d, hour: 0, minute: 0, second: 0, hasTime: false });

export const dateNodes: NodeDef[] = [
  {
    type: 'date.now',
    category: 'dates',
    label: 'Today / now',
    description: 'Today’s date, or the date and time now, on the device running the app.',
    inputs: [],
    outputs: [{ id: 'value', label: 'Date', kind: 'data', valueType: 'text' }],
    configFields: [
      {
        key: 'what',
        label: 'Give',
        type: 'select',
        default: 'date',
        options: Object.entries(NOWS).map(([value, n]) => ({ value, label: n.label })),
      },
    ],
    sentence: (c) => (NOWS[String(c.what)] ?? NOWS.date).sentence,
    async evaluate(ctx) {
      return { value: (NOWS[String(ctx.config.what)] ?? NOWS.date).show() };
    },
  },
  {
    type: 'date.format',
    category: 'dates',
    label: 'Show date',
    description: 'Writes a date the way people read it, such as 15 November 2026 or 2:30 PM.',
    inputs: [dateIn('date', 'Date')],
    outputs: [{ id: 'value', label: 'Text', kind: 'data', valueType: 'text' }],
    configFields: [
      {
        key: 'format',
        label: 'Show as',
        type: 'select',
        default: 'long',
        options: Object.entries(FORMATS).map(([value, f]) => ({ value, label: f.label })),
      },
    ],
    sentence: (c) => `Date as ${(FORMATS[String(c.format)] ?? FORMATS.long).label}`,
    async evaluate(ctx) {
      const format = String(ctx.config.format);
      const withTime = format === 'time12' || format === 'time24' || format === 'longTime';
      return { value: (FORMATS[format] ?? FORMATS.long).show(await readDate(ctx, 'date', withTime)) };
    },
  },
  {
    type: 'date.add',
    category: 'dates',
    label: 'Add to date',
    description: 'Moves a date on by some minutes, hours, days, weeks, months or years. Take away with a minus number.',
    inputs: [dateIn('date', 'Date'), { id: 'amount', label: 'Add', kind: 'data', valueType: 'number', inline: { type: 'number', default: 1 } }],
    outputs: [{ id: 'value', label: 'Date', kind: 'data', valueType: 'text' }],
    configFields: [unitField('Unit', 'days')],
    sentence: (c) => {
      const unit = String(c.unit ?? 'days');
      const amount = c.amount === undefined || c.amount === '' ? 1 : toNumber(c.amount);
      const units = Math.abs(amount) === 1 ? unit.replace(/s$/, '') : unit;
      return amount < 0 ? `Take ${-amount} ${units} from a date` : `Add ${amount} ${units} to a date`;
    },
    async evaluate(ctx) {
      const unit = String(ctx.config.unit ?? 'days');
      const date = await readDate(ctx, 'date', unit === 'minutes' || unit === 'hours');
      return { value: writeDate(addToDate(date, toNumber(await ctx.input('amount')), unit)) };
    },
  },
  {
    type: 'date.between',
    category: 'dates',
    label: 'Time between dates',
    description: 'How many whole days (or minutes, hours, weeks, months or years) from one date to another. Minus when the second comes first.',
    inputs: [dateIn('from', 'From'), dateIn('to', 'To')],
    outputs: [{ id: 'value', label: 'Number', kind: 'data', valueType: 'number' }],
    configFields: [unitField('Count', 'days')],
    sentence: (c) => `Whole ${String(c.unit ?? 'days')} between two dates`,
    async evaluate(ctx) {
      const unit = String(ctx.config.unit ?? 'days');
      const withTime = unit === 'minutes' || unit === 'hours';
      let from = await readDate(ctx, 'from', withTime);
      let to = await readDate(ctx, 'to', withTime);
      // Counting days from a date to today: today counts as a whole day.
      if (!withTime && (!from.hasTime || !to.hasTime)) [from, to] = [dayOnly(from), dayOnly(to)];
      return { value: timeBetween(from, to, unit) };
    },
  },
  {
    type: 'date.compare',
    category: 'dates',
    label: 'Compare dates',
    description: 'Checks whether one date is before, after or on the same day as another.',
    inputs: [dateIn('a', 'Date'), dateIn('b', 'Other date')],
    outputs: [{ id: 'value', label: 'Is true', kind: 'data', valueType: 'boolean' }],
    configFields: [
      {
        key: 'op',
        label: 'Check',
        type: 'select',
        default: 'before',
        options: Object.entries(COMPARES).map(([value, c]) => ({ value, label: c.label })),
      },
    ],
    sentence: (c) => `Date ${(COMPARES[String(c.op)] ?? COMPARES.before).label} the other`,
    async evaluate(ctx) {
      const op = String(ctx.config.op);
      const compare = COMPARES[op] ?? COMPARES.before;
      let a = await readDate(ctx, 'a', true);
      let b = await readDate(ctx, 'b', true);
      // Only the days count when either has no time, or for "same day".
      if (op === 'same' || !a.hasTime || !b.hasTime) [a, b] = [dayOnly(a), dayOnly(b)];
      return { value: compare.test(toMs(a), toMs(b)) };
    },
  },
  {
    type: 'date.part',
    category: 'dates',
    label: 'Part of date',
    description: 'One part of a date: the year, month, day, day of the week, hour or minute.',
    inputs: [dateIn('date', 'Date')],
    outputs: [{ id: 'value', label: 'Part', kind: 'data', valueType: 'any' }],
    configFields: [
      {
        key: 'part',
        label: 'Get the',
        type: 'select',
        default: 'year',
        options: Object.entries(PARTS).map(([value, p]) => ({ value, label: p.label })),
      },
    ],
    sentence: (c) => {
      const label = (PARTS[String(c.part)] ?? PARTS.year).label;
      return `The ${label.replace(', as a number', '')} of a date`;
    },
    async evaluate(ctx) {
      const part = String(ctx.config.part);
      const d = await readDate(ctx, 'date', part === 'hour' || part === 'minute');
      return { value: (PARTS[part] ?? PARTS.year).get(d) };
    },
  },
];
