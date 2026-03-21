import { useRef, useLayoutEffect, memo } from "react";
import { createPortal } from "react-dom";
import { usePaneStore, collectLeafIds } from "@/stores/pane-store";
import { registerPaneContainer, unregisterPaneContainer } from "@/utils/pane-container-registry";
import type { PaneNode } from "@/stores/pane-store";
import { SplitHandle } from "@/components/split-handle";
import { TerminalPane } from "@/components/terminal-pane";
import { ClaudeChatPane } from "@/components/claude-chat-pane";

/**
 * Leaf slot — mounts a stable container element into the layout.
 * Uses useLayoutEffect to reparent before paint, preventing flicker.
 */
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

/** Recursive layout renderer — only renders split structure, no terminals */
function TreeLayout({
  node,
  projectPath,
  containers,
}: {
  node: PaneNode;
  projectPath: string;
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
        <TreeLayout node={node.first} projectPath={projectPath} containers={containers} />
      </div>
      <SplitHandle
        direction={node.direction}
        onResize={(ratio) => setRatio(projectPath, node.id, ratio)}
      />
      <div style={{ flexBasis: secondPercent }} className="min-w-0 min-h-0 overflow-hidden">
        <TreeLayout node={node.second} projectPath={projectPath} containers={containers} />
      </div>
    </div>
  );
}

interface SplitPaneContainerProps {
  projectPath: string;
}

/**
 * Split pane container with portal-based terminal rendering.
 *
 * Terminals are rendered via portals into stable container elements that
 * persist across tree restructures. This prevents React from unmounting
 * and remounting TerminalPane components (which would kill PTY sessions)
 * when the pane tree changes (e.g., during splits).
 */
export function SplitPaneContainer({ projectPath }: SplitPaneContainerProps) {
  const tree = usePaneStore((s) => s.getTree(projectPath));
  const activeId = usePaneStore((s) => s.getActiveId(projectPath));
  const setActive = usePaneStore((s) => s.setActive);
  const getPaneType = usePaneStore((s) => s.getPaneType);

  const leafIds = collectLeafIds(tree);

  // Stable container elements — persist across tree restructures
  const containersRef = useRef(new Map<string, HTMLDivElement>());

  // Ensure containers exist for current leaves
  for (const id of leafIds) {
    if (!containersRef.current.has(id)) {
      const el = document.createElement("div");
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.overflow = "hidden";
      containersRef.current.set(id, el);
      registerPaneContainer(id, el);
    }
  }

  // Remove containers for closed panes
  for (const [id] of containersRef.current) {
    if (!leafIds.includes(id)) {
      unregisterPaneContainer(id);
      containersRef.current.delete(id);
    }
  }

  return (
    <>
      <TreeLayout node={tree} projectPath={projectPath} containers={containersRef.current} />
      {leafIds.map((id) => {
        const container = containersRef.current.get(id)!;
        const paneType = getPaneType(projectPath, id);
        const PaneComponent = paneType === "claude" ? ClaudeChatPane : TerminalPane;
        return createPortal(
          <PaneComponent
            key={id}
            projectPath={projectPath}
            paneId={id}
            isActive={id === activeId}
            onFocus={() => setActive(projectPath, id)}
          />,
          container,
        );
      })}
    </>
  );
}
