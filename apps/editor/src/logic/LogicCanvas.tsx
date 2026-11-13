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
  type FinalConnectionState,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { CATEGORIES, canConnect, defaultConfig, findPin, getNodeDef, type BlockSuggestion } from '@code-blocks/engine/registry';
import { useProjectStore } from '../model/projectStore';
import { makeNameLookup } from '../model/tree';
import { BlockNode, TYPE_COLORS } from './BlockNode';
import { BlockSuggestMenu, type SuggestRequest } from './BlockSuggestMenu';
import { ValueEdge } from './ValueEdge';

export const NODE_DRAG_MIME = 'application/x-codeblocks-node';
const nodeTypes = { block: BlockNode };
// Data wires show their live value while the app runs.
const edgeTypes = { value: ValueEdge };

export function LogicCanvas() {
  const graph = useProjectStore((s) => s.project.graph);
  const selection = useProjectStore((s) => s.selection);
  const { select, moveNodes, deleteNodes, deleteEdges, addEdge, addNode, addWiredNode } = useProjectStore.getState();
  const rf = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [suggest, setSuggest] = useState<
    (SuggestRequest & { nodeId: string; client: { x: number; y: number } }) | null
  >(null);

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

  // Reflect selection made elsewhere (Inspector, error "show me" links, paste).
  useEffect(() => {
    const ids = new Set(selection?.kind === 'node' ? (selection.ids ?? [selection.id]) : []);
    setNodes((ns) => ns.map((n) => (Boolean(n.selected) === ids.has(n.id) ? n : { ...n, selected: ids.has(n.id) })));
  }, [selection]);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const src = graph.nodes.find((n) => n.id === e.source);
        const pin = src && getNodeDef(src.type) ? findPin(getNodeDef(src.type)!, 'out', e.sourcePin) : undefined;
        const color = e.kind === 'exec' ? '#495057' : TYPE_COLORS[pin?.valueType ?? 'any'];
        return {
          id: e.id,
          type: e.kind === 'data' ? 'value' : undefined,
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
      const next = applyNodeChanges(
        changes.filter((c) => c.type !== 'remove'),
        nodesRef.current,
      );
      nodesRef.current = next;
      setNodes(next);
      if (!changes.some((c) => c.type === 'select')) return;
      // Several blocks can be selected (Ctrl+click, or Shift+drag a box) to copy or move them together.
      const ids = next.filter((n) => n.selected).map((n) => n.id);
      const current = useProjectStore.getState().selection;
      if (!ids.length) {
        if (current?.kind === 'node') select(null);
        return;
      }
      const picked = changes.find((c) => c.type === 'select' && c.selected);
      const id =
        picked && 'id' in picked
          ? picked.id
          : current?.kind === 'node' && ids.includes(current.id)
            ? current.id
            : ids[ids.length - 1];
      select({ kind: 'node', id, ids: ids.length > 1 ? ids : undefined });
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
      const { project } = useProjectStore.getState();
      const sp =
        sd && c.sourceHandle
          ? findPin(sd, 'out', c.sourceHandle, { ...defaultConfig(sd), ...s.config }, makeNameLookup(project))
          : undefined;
      const tp = td && c.targetHandle ? findPin(td, 'in', c.targetHandle, { ...defaultConfig(td), ...t.config }) : undefined;
      return Boolean(sp && tp && canConnect(sp, tp));
    },
    [],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!isValidConnection(c)) return;
      const { project } = useProjectStore.getState();
      const s = project.graph.nodes.find((n) => n.id === c.source)!;
      const def = getNodeDef(s.type)!;
      const pin = findPin(def, 'out', c.sourceHandle!, { ...defaultConfig(def), ...s.config }, makeNameLookup(project))!;
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

  // A wire dropped on empty space opens a menu of blocks that fit it.
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode || !state.fromHandle?.id) return;
    const target = event.target as Element | null;
    if (!target?.classList.contains('react-flow__pane')) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!point || !box) return;
    const { project } = useProjectStore.getState();
    const gn = project.graph.nodes.find((n) => n.id === state.fromNode!.id);
    const def = gn && getNodeDef(gn.type);
    if (!def) return;
    const side = state.fromHandle.type === 'source' ? 'out' : 'in';
    const pin = findPin(def, side, state.fromHandle.id, { ...defaultConfig(def), ...gn.config }, makeNameLookup(project));
    if (!pin) return;
    setSuggest({
      at: { x: point.clientX - box.left, y: point.clientY - box.top },
      client: { x: point.clientX, y: point.clientY },
      pin,
      side,
      nodeId: gn.id,
    });
  }, []);

  const closeSuggest = useCallback(() => setSuggest(null), []);

  const pickSuggestion = (s: BlockSuggestion) => {
    if (!suggest) return;
    const pos = rf.screenToFlowPosition(suggest.client);
    // Put the new block on the far side of the drop point, so the wire stays short.
    const position = suggest.side === 'out' ? { x: pos.x + 10, y: pos.y - 30 } : { x: pos.x - 250, y: pos.y - 30 };
    addWiredNode(s.def.type, position, { nodeId: suggest.nodeId, pinId: suggest.pin.id, side: suggest.side }, s.pin.id, s.pin.kind);
    setSuggest(null);
  };

  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer.getData(NODE_DRAG_MIME);
    if (!type) return;
    e.preventDefault();
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(type, { x: pos.x - 20, y: pos.y - 20 });
  };

  return (
    <div
      ref={canvasRef}
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
        edgeTypes={edgeTypes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
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
        onMoveStart={closeSuggest}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
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
      {suggest && <BlockSuggestMenu request={suggest} onPick={pickSuggestion} onClose={closeSuggest} />}
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
