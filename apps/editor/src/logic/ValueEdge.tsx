import { BaseEdge, EdgeLabelRenderer, getBezierPath, useStore, type EdgeProps } from '@xyflow/react';
import { previewValue } from '../engine/preview';
import { useRuntimeStore } from '../runtime/runtimeStore';

/**
 * A data wire. While the app runs, it shows the last value that passed
 * through it in a small label; pointing at the label shows the whole value.
 */
export function ValueEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, interactionWidth } =
    props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const live = useRuntimeStore((s) => (s.running ? s.wires[id] : undefined));
  const shown = live && previewValue(live.value);
  // Zoomed out, the label keeps its size on screen so it stays readable.
  const zoom = useStore((s) => s.transform[2]);
  const scale = Math.max(1, 1 / zoom);

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      {shown && (
        <EdgeLabelRenderer>
          <div
            // A new key each time a value passes replays the pulse.
            key={live.n}
            className="wire-value nopan"
            data-edge-id={id}
            title={shown.full}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) scale(${scale})`,
              borderColor: typeof style?.stroke === 'string' ? style.stroke : undefined,
            }}
          >
            {shown.short}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
