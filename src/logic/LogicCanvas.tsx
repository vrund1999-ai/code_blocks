import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { CATEGORIES, canConnect, findPin, getNodeDef } from '../engine/registry';
import { useProjectStore } from '../model/projectStore';
import { BlockNode, TYPE_COLORS } from './BlockNode';

export const NODE_DRAG_MIME = 'application/x-codeblocks-node';
const nodeTypes = { block: BlockNode };

export function LogicCanvas() {
  const graph = useProjectStore((s) => s.project.graph);
  const selection = useProjectStore((s) => s.selection);
  const { select, moveNodes, deleteNodes, deleteEdges, addEdge, addNode } = useProjectStore.getState();
  const rf = useReactFlow();

  // Local React Flow node state (keeps measurements / drag positions); synced from the store.
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());

  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return graph.nodes.map((gn) => ({
        ...(prevById.get(gn.id) ?? {}),
        id: gn.id,
        type: 'block',
        position: gn.position,
        data: {},
      }));
    });
  }, [graph.nodes]);

  // Reflect selection made elsewhere (Inspector, error "show me" links).
  useEffect(() => {
    const id = selection?.kind === 'node' ? selection.id : null;
    setNodes((ns) => ns.map((n) => (Boolean(n.selected) === (n.id === id) ? n : { ...n, selected: n.id === id })));
  }, [selection]);

  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const src = graph.nodes.find((n) => n.id === e.source);
        const pin = src && getNodeDef(src.type) ? findPin(getNodeDef(src.type)!, 'out', e.sourcePin) : undefined;
        const color = e.kind === 'exec' ? '#495057' : TYPE_COLORS[pin?.valueType ?? 'any'];
        return {
          id: e.id,
          source: e.source,
          sourceHandle: e.sourcePin,
          target: e.target,
          targetHandle: e.targetPin,
          selected: selectedEdges.has(e.id),
          className: `edge-${e.kind}`,
          style: { stroke: color, strokeWidth: e.kind === 'exec' ? 3 : 2 },
          markerEnd: e.kind === 'exec' ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 } : undefined,
          animated: e.kind === 'data',
        };
      }),
    [graph.edges, graph.nodes, selectedEdges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns));
      for (const c of changes) {
        if (c.type === 'select' && c.selected) select({ kind: 'node', id: c.id });
      }
    },
    [select],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setSelectedEdges((prev) => {
      const next = new Set(prev);
      for (const c of changes) {
        if (c.type === 'select') {
          if (c.selected) next.add(c.id);
          else next.delete(c.id);
        }
      }
      return next;
    });
  }, []);

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (c.source === c.target) return false;
      const { nodes: gn } = useProjectStore.getState().project.graph;
      const s = gn.find((n) => n.id === c.source);
      const t = gn.find((n) => n.id === c.target);
      const sd = s && getNodeDef(s.type);
      const td = t && getNodeDef(t.type);
      const sp = sd && c.sourceHandle ? findPin(sd, 'out', c.sourceHandle) : undefined;
      const tp = td && c.targetHandle ? findPin(td, 'in', c.targetHandle) : undefined;
      return Boolean(sp && tp && canConnect(sp, tp));
    },
    [],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!isValidConnection(c)) return;
      const s = useProjectStore.getState().project.graph.nodes.find((n) => n.id === c.source)!;
      const pin = findPin(getNodeDef(s.type)!, 'out', c.sourceHandle!)!;
      addEdge({
        source: c.source,
        sourcePin: c.sourceHandle!,
        target: c.target,
        targetPin: c.targetHandle!,
        kind: pin.kind,
      });
    },
    [addEdge, isValidConnection],
  );

  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer.getData(NODE_DRAG_MIME);
    if (!type) return;
    e.preventDefault();
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(type, { x: pos.x - 20, y: pos.y - 20 });
  };

  return (
    <div
      className="logic-canvas"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(NODE_DRAG_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeDragStop={(_, __, dragged) =>
          moveNodes(Object.fromEntries(dragged.map((n) => [n.id, { x: n.position.x, y: n.position.y }])))
        }
        onDelete={({ nodes: dn, edges: de }) => {
          const nodeIds = dn.map((n) => n.id);
          const gone = new Set(nodeIds);
          const edgeIds = de.filter((e) => !gone.has(e.source) && !gone.has(e.target)).map((e) => e.id);
          if (nodeIds.length) deleteNodes(nodeIds);
          if (edgeIds.length) deleteEdges(edgeIds);
        }}
        onPaneClick={() => select(null)}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const gn = graph.nodes.find((x) => x.id === n.id);
            const def = gn && getNodeDef(gn.type);
            return CATEGORIES.find((c) => c.id === def?.category)?.color ?? '#adb5bd';
          }}
        />
      </ReactFlow>
      {graph.nodes.length === 0 && (
        <div className="logic-empty">
          <h2>Make your app do things</h2>
          <p>
            1. Drag a <b style={{ color: CATEGORIES[0].color }}>When…</b> block from the left (for example “When button
            clicked”).
            <br />
            2. Add a <b style={{ color: CATEGORIES[1].color }}>Do…</b> block and connect the arrow from the first block
            into it.
            <br />
            3. Press <b>▶ Run</b> and try it out in the preview.
          </p>
        </div>
      )}
    </div>
  );
}
