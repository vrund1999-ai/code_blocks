import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useMemo, useState, type ReactNode } from 'react';
import { ELEMENT_DEFS } from '../model/elements';
import { useProjectStore } from '../model/projectStore';
import type { UIElement } from '../model/types';
import { AppView, type DesignHooks } from '../runtime/Renderer';
import { useRuntimeStore } from '../runtime/runtimeStore';
import { useDesignDnd, type DragData } from './DesignDnd';
import { useLayerHover } from './LayersPanel';

function DesignNode({
  el,
  isRoot,
  fixedWidth,
  children,
}: {
  el: UIElement;
  isRoot: boolean;
  fixedWidth: boolean;
  children: ReactNode;
}) {
  const { draggingId } = useDesignDnd();
  const selected = useProjectStore((s) => s.selection?.kind === 'element' && s.selection.id === el.id);
  const select = useProjectStore((s) => s.select);
  const hovered = useLayerHover((s) => s.id === el.id);
  const drag = useDraggable({
    id: `el:${el.id}`,
    data: { source: 'element', id: el.id } satisfies DragData,
    disabled: isRoot,
  });
  const drop = useDroppable({ id: el.id });

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      data-el-id={el.id}
      className={[
        'el-wrap',
        `el-wrap-${el.type}`,
        isRoot && 'el-wrap-root',
        fixedWidth && 'fixed-width',
        selected && 'selected',
        hovered && 'layer-hover',
        draggingId === el.id && 'dragging',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'element', id: el.id });
      }}
      {...(isRoot ? {} : drag.listeners)}
      {...(isRoot ? {} : drag.attributes)}
      tabIndex={-1}
    >
      {!isRoot && (
        <span className="el-tag">
          {ELEMENT_DEFS[el.type].icon} {el.name}
        </span>
      )}
      {children}
    </div>
  );
}

const DEVICES = {
  phone: { label: '📱 Phone', width: 390 },
  tablet: { label: 'Tablet', width: 768 },
  desktop: { label: '🖥 Desktop', width: 1100 },
};

export function DeviceFrame({
  children,
  device,
  title,
}: {
  children: ReactNode;
  device: keyof typeof DEVICES;
  title: string;
}) {
  return (
    <div className="device" style={{ width: DEVICES[device].width }}>
      <div className="device-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="device-title">{title}</span>
      </div>
      <div className="device-body">{children}</div>
    </div>
  );
}

export function DesignCanvas() {
  const screenId = useProjectStore((s) => s.activeScreenId);
  const screenName = useProjectStore((s) => s.project.screens.find((x) => x.id === s.activeScreenId)?.name ?? '');
  const select = useProjectStore((s) => s.select);
  const running = useRuntimeStore((s) => s.running);
  const runScreenId = useRuntimeStore((s) => s.screenId);
  const { dropTarget } = useDesignDnd();
  const [device, setDevice] = useState<keyof typeof DEVICES>('phone');

  const hooks = useMemo<DesignHooks>(
    () => ({
      wrap: (el, isRoot, content, fixedWidth) => (
        <DesignNode key={el.id} el={el} isRoot={isRoot} fixedWidth={fixedWidth}>
          {content}
        </DesignNode>
      ),
      dropIndex: (id) => (dropTarget?.parentId === id ? dropTarget.index : null),
    }),
    [dropTarget],
  );

  return (
    <div className="design-canvas" onClick={() => select(null)}>
      <div className="canvas-toolbar" onClick={(e) => e.stopPropagation()}>
        {Object.entries(DEVICES).map(([k, d]) => (
          <button
            key={k}
            className={`chip ${device === k ? 'active' : ''}`}
            onClick={() => setDevice(k as keyof typeof DEVICES)}
          >
            {d.label}
          </button>
        ))}
        {running && <span className="running-note">▶ Running — use your app below. Press Stop to keep editing.</span>}
      </div>
      <div className="canvas-scroll">
        <DeviceFrame device={device} title={running ? 'Running' : screenName}>
          {running && runScreenId ? (
            <AppView screenId={runScreenId} mode="run" />
          ) : (
            <AppView screenId={screenId} mode="design" design={hooks} />
          )}
        </DeviceFrame>
      </div>
    </div>
  );
}
