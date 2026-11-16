import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphEdge, GraphNode, LogicGraph } from './graph';
import { Interpreter } from './interpreter';
import { addToDate, parseDate, timeBetween, writeDate } from './nodes/dates';
import { GraphError, type HostApi } from './types';

const node = (id: string, type: string, config: Record<string, unknown> = {}): GraphNode => ({ id, type, config, position: { x: 0, y: 0 } });
const edge = (source: string, sourcePin: string, target: string, targetPin: string, kind: GraphEdge['kind']): GraphEdge => ({
  id: `${source}.${sourcePin}->${target}.${targetPin}`,
  source,
  sourcePin,
  target,
  targetPin,
  kind,
});

/** Runs one block, with its typed-in values in `config`, and returns its result. */
async function value(type: string, config: Record<string, unknown> = {}) {
  const vars: Record<string, unknown> = {};
  const host = {
    getVar: (id: string) => vars[id],
    setVar: (id: string, v: unknown) => void (vars[id] = v),
    sleep: async () => {},
  } as unknown as HostApi;
  const graph: LogicGraph = {
    nodes: [node('start', 'event.screenLoad', { screen: 's' }), node('block', type, config), node('save', 'action.setVariable', { variable: 'out' })],
    edges: [edge('start', 'next', 'save', 'in', 'exec'), edge('block', 'value', 'save', 'value', 'data')],
  };
  await new Interpreter(graph, host).runEvent('start');
  return vars.out;
}

const date = (text: string) => parseDate(text)!;

describe('reading and writing dates', () => {
  it('reads dates, with or without a time', () => {
    expect(parseDate('2026-11-15')).toEqual({ year: 2026, month: 11, day: 15, hour: 0, minute: 0, second: 0, hasTime: false });
    expect(parseDate(' 2026-1-5 9:05 ')).toMatchObject({ month: 1, day: 5, hour: 9, minute: 5, hasTime: true });
    // As a date picker or another program might write them.
    expect(parseDate('2026-11-15T14:30:15.250')).toMatchObject({ hour: 14, minute: 30, second: 15 });
  });

  it.each(['', 'tomorrow', '15/11/2026', '2026-13-01', '2026-02-29', '2026-11-15 24:00', '2026-11-15 10:60'])('“%s” isn’t a date', (text) => {
    expect(parseDate(text)).toBeNull();
  });

  it('writes them back the same way, with seconds only when there are some', () => {
    expect(writeDate(date('2026-1-5'))).toBe('2026-01-05');
    expect(writeDate(date('2026-11-15 9:05'))).toBe('2026-11-15 09:05');
    expect(writeDate(date('2026-11-15 09:05:07'))).toBe('2026-11-15 09:05:07');
    expect(parseDate('2028-02-29')).not.toBeNull();
  });
});

describe('adding to dates', () => {
  it.each([
    ['2026-11-15', 1, 'days', '2026-11-16'],
    ['2026-12-31', 1, 'days', '2027-01-01'],
    ['2026-03-01', -1, 'days', '2026-02-28'],
    ['2026-11-15', 2, 'weeks', '2026-11-29'],
    ['2026-01-31', 1, 'months', '2026-02-28'],
    ['2028-02-29', 1, 'years', '2029-02-28'],
    ['2026-11-15', -11, 'months', '2025-12-15'],
    ['2026-11-15 23:30', 45, 'minutes', '2026-11-16 00:15'],
    ['2026-11-15', 3, 'hours', '2026-11-15 03:00'],
    ['2026-11-15', 1.9, 'days', '2026-11-16'],
  ])('%s + %s %s = %s', (from, amount, unit, result) => {
    expect(writeDate(addToDate(date(from), amount, unit))).toBe(result);
  });

  it('counts whole units between dates, minus when the second comes first', () => {
    expect(timeBetween(date('2026-11-15'), date('2026-12-25'), 'days')).toBe(40);
    expect(timeBetween(date('2026-12-25'), date('2026-11-15'), 'days')).toBe(-40);
    expect(timeBetween(date('2026-11-15'), date('2026-12-25'), 'weeks')).toBe(5);
    expect(timeBetween(date('2026-01-31'), date('2026-02-28'), 'months')).toBe(1);
    expect(timeBetween(date('2026-01-20'), date('2026-02-10'), 'months')).toBe(0);
    expect(timeBetween(date('2026-02-10'), date('2026-01-20'), 'months')).toBe(0);
    expect(timeBetween(date('1990-11-16'), date('2026-11-15'), 'years')).toBe(35);
    expect(timeBetween(date('1990-11-15'), date('2026-11-15'), 'years')).toBe(36);
    expect(timeBetween(date('2026-11-15 09:00'), date('2026-11-15 17:30'), 'hours')).toBe(8);
    expect(timeBetween(date('2026-11-15 09:00'), date('2026-11-15 17:30'), 'minutes')).toBe(510);
  });

  it('isn’t thrown off by daylight saving', () => {
    // Clocks go forward in much of Europe on 29 March 2026 and in the US on 8 March.
    expect(timeBetween(date('2026-03-01'), date('2026-04-01'), 'days')).toBe(31);
    expect(writeDate(addToDate(date('2026-03-28 12:00'), 1, 'days'))).toBe('2026-03-29 12:00');
  });
});

describe('the date blocks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Sunday 15 November 2026, 2:30:45 PM on this computer's clock.
    vi.setSystemTime(new Date(2026, 10, 15, 14, 30, 45));
  });
  afterEach(() => vi.useRealTimers());

  it('Today / now', async () => {
    expect(await value('date.now')).toBe('2026-11-15');
    expect(await value('date.now', { what: 'dateTime' })).toBe('2026-11-15 14:30:45');
    expect(await value('date.now', { what: 'time' })).toBe('14:30');
  });

  it.each([
    ['long', '15 November 2026'],
    ['full', 'Sunday 15 November 2026'],
    ['us', 'November 15, 2026'],
    ['dmy', '15/11/2026'],
    ['mdy', '11/15/2026'],
    ['time12', '2:30 PM'],
    ['time24', '14:30'],
    ['longTime', '15 November 2026, 2:30 PM'],
  ])('Show date as %s', async (format, shown) => {
    expect(await value('date.format', { format, date: '2026-11-15 14:30' })).toBe(shown);
  });

  it('Show date: midnight and noon, and an empty date is now', async () => {
    expect(await value('date.format', { format: 'time12', date: '2026-11-15 00:05' })).toBe('12:05 AM');
    expect(await value('date.format', { format: 'time12', date: '2026-11-15 12:00' })).toBe('12:00 PM');
    expect(await value('date.format', { format: 'full' })).toBe('Sunday 15 November 2026');
    expect(await value('date.format', { format: 'time12' })).toBe('2:30 PM');
  });

  it('a date that can’t be read stops the block with a plain message', async () => {
    const run = value('date.format', { date: '31/12/2026' });
    await expect(run).rejects.toBeInstanceOf(GraphError);
    await expect(run).rejects.toThrow('“31/12/2026” isn’t a date. Write dates like 2026-11-15, or 2026-11-15 14:30 with a time.');
  });

  it('Add to date, from today or now when no date is given', async () => {
    expect(await value('date.add', { date: '2026-11-15', amount: 7, unit: 'days' })).toBe('2026-11-22');
    expect(await value('date.add', { amount: 1, unit: 'days' })).toBe('2026-11-16');
    expect(await value('date.add', { amount: -1, unit: 'months' })).toBe('2026-10-15');
    expect(await value('date.add', { amount: 30, unit: 'minutes' })).toBe('2026-11-15 15:00:45');
  });

  it('Time between dates counts whole days to today', async () => {
    expect(await value('date.between', { from: '2026-11-01', unit: 'days' })).toBe(14);
    expect(await value('date.between', { from: '2026-11-15 08:00', unit: 'days' })).toBe(0);
    expect(await value('date.between', { to: '2026-12-25', unit: 'days' })).toBe(40);
    expect(await value('date.between', { from: '2000-01-01', unit: 'years' })).toBe(26);
    expect(await value('date.between', { from: '2026-11-15 14:00', unit: 'minutes' })).toBe(30);
  });

  it.each([
    ['before', '2026-11-14', '2026-11-15', true],
    ['before', '2026-11-15', '2026-11-15', false],
    ['after', '2026-11-16', '2026-11-15', true],
    ['before', '2026-11-15 09:00', '2026-11-15 10:00', true],
    ['same', '2026-11-15 09:00', '2026-11-15 23:00', true],
    ['same', '2026-11-15', '2026-11-16', false],
    // A date without a time is the whole day.
    ['before', '2026-11-15', '2026-11-15 10:00', false],
  ])('Compare dates: %s of %s and %s is %s', async (op, a, b, result) => {
    expect(await value('date.compare', { op, a, b })).toBe(result);
  });

  it('Compare dates: an empty date is today', async () => {
    expect(await value('date.compare', { op: 'before', a: '2026-11-01' })).toBe(true);
    expect(await value('date.compare', { op: 'same', b: '2026-11-15' })).toBe(true);
  });

  it.each([
    ['year', 2026],
    ['month', 11],
    ['monthName', 'November'],
    ['day', 15],
    ['weekday', 'Sunday'],
    ['hour', 14],
    ['minute', 30],
  ])('Part of date: %s', async (part, result) => {
    expect(await value('date.part', { part, date: '2026-11-15 14:30' })).toBe(result);
  });

  it('Part of date: the hour of a date without a time is 0, and an empty date is now', async () => {
    expect(await value('date.part', { part: 'hour', date: '2026-11-15' })).toBe(0);
    expect(await value('date.part', { part: 'minute' })).toBe(30);
  });
});

describe('what the blocks say', () => {
  it('Add to date names its amount and unit', async () => {
    const { NODE_DEFS } = await import('./registry');
    const say = (config: Record<string, unknown>) => NODE_DEFS['date.add'].sentence!(config, {} as never);
    expect(say({ unit: 'days' })).toBe('Add 1 day to a date');
    expect(say({ unit: 'weeks', amount: 2 })).toBe('Add 2 weeks to a date');
    expect(say({ unit: 'months', amount: -1 })).toBe('Take 1 month from a date');
  });
});
