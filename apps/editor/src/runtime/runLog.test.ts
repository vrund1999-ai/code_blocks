import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_LOG_ENTRIES, clearRunLog, logError, logInput, logStep, useRunLog } from './runLog';

const entries = () => useRunLog.getState().entries;

describe('run log', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearRunLog();
  });
  afterEach(() => vi.useRealTimers());

  it('lists events and blocks with the values they used, shown together', () => {
    logStep('click', { item: 'Ada' });
    logStep('set');
    logInput('set', 'text', 'Hello');
    logInput('other', 'text', 'ignored: no line for this block');
    expect(entries()).toEqual([]); // not shown until the next flush
    vi.runAllTimers();
    expect(entries().map((e) => [e.nodeId, e.kind, e.values])).toEqual([
      ['click', 'event', { item: 'Ada' }],
      ['set', 'block', { text: 'Hello' }],
    ]);
  });

  it('adds an input to the newest line of its block, and replaces a value read twice', () => {
    logStep('add');
    logInput('add', 'item', 1);
    logStep('add');
    logInput('add', 'item', 2);
    logInput('add', 'item', 3);
    vi.runAllTimers();
    expect(entries().map((e) => e.values)).toEqual([{ item: 1 }, { item: 3 }]);
  });

  it('changes a line already shown when another input arrives', () => {
    logStep('set');
    vi.runAllTimers();
    const before = entries()[0];
    logInput('set', 'text', 'late');
    vi.runAllTimers();
    expect(entries()[0].values).toEqual({ text: 'late' });
    // A new object, so the row re-renders.
    expect(entries()[0]).not.toBe(before);
  });

  it('records errors', () => {
    logError('set', 'Pick an element.');
    vi.runAllTimers();
    expect(entries()).toMatchObject([{ nodeId: 'set', kind: 'error', message: 'Pick an element.' }]);
  });

  it('keeps only the newest lines, counting the ones dropped', () => {
    for (let i = 0; i < MAX_LOG_ENTRIES + 25; i++) logStep(`n${i}`);
    vi.runAllTimers();
    expect(entries()).toHaveLength(MAX_LOG_ENTRIES);
    expect(entries()[0].nodeId).toBe('n25');
    expect(useRunLog.getState().dropped).toBe(25);
  });

  it('Clear empties it, including lines not shown yet', () => {
    logStep('a');
    vi.runAllTimers();
    logStep('b');
    clearRunLog();
    vi.runAllTimers();
    expect(useRunLog.getState()).toEqual({ entries: [], dropped: 0 });
  });
});
