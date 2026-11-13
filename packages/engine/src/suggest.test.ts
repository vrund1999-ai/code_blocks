import { describe, expect, it } from 'vitest';
import { findPin, getNodeDef, suggestBlocks } from './registry';
import type { Pin } from './types';

const pin = (type: string, side: 'in' | 'out', id: string): Pin => findPin(getNodeDef(type)!, side, id)!;
const types = (pins: ReturnType<typeof suggestBlocks>) => pins.map((s) => s.def.type);
const pinOf = (pins: ReturnType<typeof suggestBlocks>, type: string) => pins.find((s) => s.def.type === type)?.pin.id;

describe('suggestBlocks', () => {
  it('suggests steps, not events or values, after an exec output', () => {
    const next = suggestBlocks(pin('event.click', 'out', 'next'), 'out');
    expect(types(next)).toContain('action.setText');
    expect(types(next)).toContain('flow.if');
    expect(types(next)).not.toContain('event.click');
    expect(types(next)).not.toContain('data.number');
    expect(next.every((s) => s.pin.kind === 'exec')).toBe(true);
  });

  it('suggests events and steps before an exec input', () => {
    const before = suggestBlocks(pin('action.setText', 'in', 'in'), 'in');
    expect(types(before)).toContain('event.click');
    expect(types(before)).toContain('action.toast');
    expect(types(before)).not.toContain('data.math');
  });

  it('only suggests blocks whose inputs can take the value', () => {
    const list = suggestBlocks(pin('list.sort', 'out', 'value'), 'out');
    expect(types(list)).toContain('list.filter');
    expect(types(list)).toContain('data.listLength');
    expect(types(list)).not.toContain('data.math'); // a list is not a number
    expect(pinOf(list, 'list.join')).toBe('list');
  });

  it('wires the input whose type matches best', () => {
    const number = suggestBlocks(pin('data.number', 'out', 'value'), 'out');
    // "Text length" has only a text input, which numbers convert to.
    expect(pinOf(number, 'text.length')).toBe('text');
    // "Insert into list" takes "any" item first, but the number Position matches exactly.
    expect(pinOf(number, 'action.insertInList')).toBe('index');
    expect(number.find((s) => s.def.type === 'text.length')?.fits).toBe(1);
    expect(number.find((s) => s.def.type === 'data.join')?.fits).toBe(2);
  });

  it('suggests where a value can come from, keeping palette order', () => {
    const from = suggestBlocks(pin('flow.if', 'in', 'condition'), 'in');
    expect(types(from)).toContain('data.compare');
    expect(types(from)).toContain('text.contains');
    expect(types(from).indexOf('data.compare')).toBeLessThan(types(from).indexOf('text.contains'));
    expect(from.every((s) => s.pin.kind === 'data')).toBe(true);
  });
});
