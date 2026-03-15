import { useRef, useLayoutEffect, memo } from "react";
import { createPortal } from "react-dom";
import { usePaneStore, collectLeafIds } from "@/stores/pane-store";
import type { PaneNode } from "@/stores/pane-store";
import { SplitHandle } from "@/components/split-handle";
import { SshTerminalPane } from "@/components/ssh-terminal-pane";

/** Leaf slot — mounts a stable container element into the layout */
const LeafSlot = memo(function LeafSlot({
  container,
}: {
  container: HTMLDivElement;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current && container.parentElement !== ref.current) {
      ref.current.appendChild(container);
    }
  });

  return <div ref={ref} className="h-full w-full" />;
});

/** Recursive layout renderer — only renders split structure */
function TreeLayout({
  node,
  sessionId,
  containers,
}: {
  node: PaneNode;
  sessionId: string;
  containers: Map<string, HTMLDivElement>;
}) {
  const setRatio = usePaneStore((s) => s.setRatio);

  if (node.type === "leaf") {
    const container = containers.get(node.id);
    if (!container) return null;
    return <LeafSlot container={container} />;
  }

  const isHorizontal = node.direction === "horizontal";
  const firstPercent = `${node.ratio * 100}%`;
  const secondPercent = `${(1 - node.ratio) * 100}%`;

  return (
    <div className={`flex h-full w-full ${isHorizontal ? "flex-row" : "flex-col"}`}>
      <div style={{ flexBasis: firstPercent }} className="min-w-0 min-h-0 overflow-hidden">
        <TreeLayout node={node.first} sessionId={sessionId} containers={containers} />
      </div>
      <SplitHandle
        direction={node.direction}
        onResize={(ratio) => setRatio(sessionId, node.id, ratio)}
      />
      <div style={{ flexBasis: secondPercent }} className="min-w-0 min-h-0 overflow-hidden">
        <TreeLayout node={node.second} sessionId={sessionId} containers={containers} />
      </div>
    </div>
  );
}

interface SshSplitPaneContainerProps {
  sessionId: string;
}

/**
 * SSH split pane container with portal-based terminal rendering.
 * Same portal approach as SplitPaneContainer to prevent SSH channel
 * destruction when the pane tree restructures during splits.
 */
export function SshSplitPaneContainer({ sessionId }: SshSplitPaneContainerProps) {
  const tree = usePaneStore((s) => s.getTree(sessionId));
  const activeId = usePaneStore((s) => s.getActiveId(sessionId));
  const setActive = usePaneStore((s) => s.setActive);

  const leafIds = collectLeafIds(tree);

  const containersRef = useRef(new Map<string, HTMLDivElement>());

  for (const id of leafIds) {
    if (!containersRef.current.has(id)) {
      const el = document.createElement("div");
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.overflow = "hidden";
      containersRef.current.set(id, el);
    }
  }

  for (const [id] of containersRef.current) {
    if (!leafIds.includes(id)) {
      containersRef.current.delete(id);
    }
  }

  return (
    <>
      <TreeLayout node={tree} sessionId={sessionId} containers={containersRef.current} />
      {leafIds.map((id) => {
        const container = containersRef.current.get(id)!;
        return createPortal(
          <SshTerminalPane
            key={id}
            sessionId={sessionId}
            paneId={id}
            isActive={id === activeId}
            onFocus={() => setActive(sessionId, id)}
          />,
          container,
        );
      })}
    </>
  );
}
