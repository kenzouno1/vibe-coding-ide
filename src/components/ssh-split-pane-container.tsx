import { usePaneStore } from "@/stores/pane-store";
import type { PaneNode } from "@/stores/pane-store";
import { SplitHandle } from "@/components/split-handle";
import { SshTerminalPane } from "@/components/ssh-terminal-pane";

interface SshSplitPaneContainerProps {
  sessionId: string;
  /** Internal: override node for recursive rendering */
  node?: PaneNode;
}

export function SshSplitPaneContainer({
  sessionId,
  node,
}: SshSplitPaneContainerProps) {
  const getTree = usePaneStore((s) => s.getTree);
  const getActiveId = usePaneStore((s) => s.getActiveId);
  const setActive = usePaneStore((s) => s.setActive);
  const setRatio = usePaneStore((s) => s.setRatio);

  const resolvedNode = node ?? getTree(sessionId);
  const activeId = getActiveId(sessionId);

  if (resolvedNode.type === "leaf") {
    return (
      <SshTerminalPane
        sessionId={sessionId}
        paneId={resolvedNode.id}
        isActive={resolvedNode.id === activeId}
        onFocus={() => setActive(sessionId, resolvedNode.id)}
      />
    );
  }

  const isHorizontal = resolvedNode.direction === "horizontal";
  const firstPercent = `${resolvedNode.ratio * 100}%`;
  const secondPercent = `${(1 - resolvedNode.ratio) * 100}%`;

  return (
    <div className={`flex h-full w-full ${isHorizontal ? "flex-row" : "flex-col"}`}>
      <div style={{ flexBasis: firstPercent }} className="min-w-0 min-h-0 overflow-hidden">
        <SshSplitPaneContainer sessionId={sessionId} node={resolvedNode.first} />
      </div>
      <SplitHandle
        direction={resolvedNode.direction}
        onResize={(ratio) => setRatio(sessionId, resolvedNode.id, ratio)}
      />
      <div style={{ flexBasis: secondPercent }} className="min-w-0 min-h-0 overflow-hidden">
        <SshSplitPaneContainer sessionId={sessionId} node={resolvedNode.second} />
      </div>
    </div>
  );
}
