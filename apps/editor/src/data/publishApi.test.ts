import { describe, expect, it } from 'vitest';
import { makeProject } from '../model/factory';
import { appFingerprint } from './publishApi';

describe('appFingerprint', () => {
  it('changes with anything visitors see, not with where blocks sit', () => {
    const p = makeProject('Shop');
    p.graph.nodes.push({ id: 'n', type: 'event.click', config: {}, position: { x: 0, y: 0 } });
    const first = appFingerprint(p);
    expect(appFingerprint(structuredClone(p))).toBe(first);

    const moved = structuredClone(p);
    moved.graph.nodes[0].position = { x: 300, y: 120 };
    expect(appFingerprint(moved)).toBe(first);

    expect(appFingerprint({ ...p, name: 'Renamed' })).not.toBe(first);
    const edited = structuredClone(p);
    edited.screens[0].root.props.background = { kind: 'static', value: '#fff' };
    expect(appFingerprint(edited)).not.toBe(first);
    const configured = structuredClone(p);
    configured.graph.nodes[0].config.element = 'button-1';
    expect(appFingerprint(configured)).not.toBe(first);
  });
});
