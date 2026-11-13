// Small builders for graphs in the server's tests.

import type { GraphEdge, GraphNode } from '@code-blocks/engine/graph';

let y = 0;

export const node = (id: string, type: string, config: Record<string, unknown> = {}): GraphNode => ({
  id,
  type,
  config,
  position: { x: 0, y: y++ },
});

export const exec = (source: string, target: string, sourcePin = 'next'): GraphEdge => ({
  id: `${source}-${sourcePin}-${target}`,
  source,
  sourcePin,
  target,
  targetPin: 'in',
  kind: 'exec',
});

export const data = (source: string, sourcePin: string, target: string, targetPin: string): GraphEdge => ({
  id: `${source}-${sourcePin}-${target}-${targetPin}`,
  source,
  sourcePin,
  target,
  targetPin,
  kind: 'data',
});
