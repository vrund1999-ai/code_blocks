import { describe, expect, it } from 'vitest';
import { makeProject } from '../model/factory';
import { describeSummary } from './deployStore';
import { fingerprint, type DeploymentSummary } from './serverApi';

describe('fingerprint', () => {
  it('changes when the deployed parts change, not the name', () => {
    const p = makeProject('Shop');
    const first = fingerprint(p);
    expect(fingerprint({ ...p, name: 'Renamed' })).toBe(first);
    expect(fingerprint(structuredClone(p))).toBe(first);
    const moved = structuredClone(p);
    moved.graph.nodes.push({ id: 'n', type: 'server.http', config: { path: 'x' }, position: { x: 0, y: 0 } });
    expect(fingerprint(moved)).not.toBe(first);
    expect(fingerprint({ ...p, tables: [{ id: 't', name: 'T', columns: [] }] })).not.toBe(first);
  });
});

describe('describeSummary', () => {
  const summary = (over: Partial<DeploymentSummary>): DeploymentSummary => ({
    name: 'x',
    deployedAt: '',
    fingerprint: '',
    addresses: [],
    forms: [],
    schedules: [],
    problems: [],
    ...over,
  });

  it('counts what the deployed copy answers to', () => {
    expect(describeSummary(summary({}))).toBe('no server workflows yet');
    expect(describeSummary(summary({ addresses: [{ method: 'GET', path: 'a' }], schedules: ['Every minute', 'Every hour'] }))).toBe(
      '1 web address, 2 schedules',
    );
    expect(describeSummary(summary({ forms: ['a', 'b'] }))).toBe('2 forms');
  });
});
