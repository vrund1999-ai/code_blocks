import { toBool, toList, toNumber } from '../convert';
import { execIn, type NodeDef } from '../types';

export const flowNodes: NodeDef[] = [
  {
    type: 'flow.if',
    category: 'flow',
    label: 'If / otherwise',
    description: 'Goes one way if the condition is true, another way if not.',
    inputs: [
      execIn,
      { id: 'condition', label: 'Condition', kind: 'data', valueType: 'boolean', inline: { type: 'boolean', default: true } },
    ],
    outputs: [
      { id: 'then', label: 'If true', kind: 'exec' },
      { id: 'else', label: 'Otherwise', kind: 'exec' },
    ],
    configFields: [],
    sentence: () => 'If the condition is true…',
    async execute(ctx) {
      return toBool(await ctx.input('condition')) ? 'then' : 'else';
    },
  },
  {
    type: 'flow.repeat',
    category: 'flow',
    label: 'Repeat',
    description: 'Runs the “Each time” steps a number of times, then continues with “When done”.',
    inputs: [
      execIn,
      { id: 'times', label: 'Times', kind: 'data', valueType: 'number', inline: { type: 'number', default: 3 } },
    ],
    outputs: [
      { id: 'body', label: 'Each time', kind: 'exec' },
      { id: 'done', label: 'When done', kind: 'exec' },
      { id: 'count', label: 'Count (1, 2, 3…)', kind: 'data', valueType: 'number' },
    ],
    configFields: [],
    sentence: () => 'Repeat',
    async execute(ctx) {
      const times = Math.max(0, Math.floor(toNumber(await ctx.input('times'))));
      for (let i = 1; i <= times; i++) {
        ctx.setOutputs({ count: i });
        await ctx.runBranch('body');
      }
      return 'done';
    },
  },
  {
    type: 'flow.forEach',
    category: 'flow',
    label: 'For each item',
    description: 'Runs the “Each item” steps once for every item in a list.',
    inputs: [execIn, { id: 'list', label: 'List', kind: 'data', valueType: 'list' }],
    outputs: [
      { id: 'body', label: 'Each item', kind: 'exec' },
      { id: 'done', label: 'When done', kind: 'exec' },
      { id: 'item', label: 'Item', kind: 'data', valueType: 'any' },
      { id: 'index', label: 'Position', kind: 'data', valueType: 'number' },
    ],
    configFields: [],
    sentence: () => 'For each item in the list',
    async execute(ctx) {
      const list = [...toList(await ctx.input('list'))];
      for (let i = 0; i < list.length; i++) {
        ctx.setOutputs({ item: list[i], index: i + 1 });
        await ctx.runBranch('body');
      }
      return 'done';
    },
  },
];
