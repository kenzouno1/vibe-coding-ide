import { usePaneStore } from "@/stores/pane-store";
import type { PaneNode } from "@/stores/pane-store";
import { SplitHandle } from "@/components/split-handle";
import { TerminalPane } from "@/components/terminal-pane";

interface SplitPaneContainerProps {
  projectPath: string;
  /** Internal: override node for recursive rendering */
  node?: PaneNode;
}

export function SplitPaneContainer({ projectPath, node }: SplitPaneContainerProps) {
  const getTree = usePaneStore((s) => s.getTree);
  const getActiveId = usePaneStore((s) => s.getActiveId);
  const setActive = usePaneStore((s) => s.setActive);
  const setRatio = usePaneStore((s) => s.setRatio);

  const resolvedNode = node ?? getTree(projectPath);
  const activeId = getActiveId(projectPath);

  if (resolvedNode.type === "leaf") {
    return (
      <TerminalPane
        projectPath={projectPath}
        isActive={resolvedNode.id === activeId}
        onFocus={() => setActive(projectPath, resolvedNode.id)}
      />
    );
  }

  const isHorizontal = resolvedNode.direction === "horizontal";
  const firstPercent = `${resolvedNode.ratio * 100}%`;
  const secondPercent = `${(1 - resolvedNode.ratio) * 100}%`;

  return (
    <div className={`flex h-full w-full ${isHorizontal ? "flex-row" : "flex-col"}`}>
      <div style={{ flexBasis: firstPercent }} className="min-w-0 min-h-0 overflow-hidden">
        <SplitPaneContainer projectPath={projectPath} node={resolvedNode.first} />
      </div>
      <SplitHandle
        direction={resolvedNode.direction}
        onResize={(ratio) => setRatio(projectPath, resolvedNode.id, ratio)}
      />
      <div style={{ flexBasis: secondPercent }} className="min-w-0 min-h-0 overflow-hidden">
        <SplitPaneContainer projectPath={projectPath} node={resolvedNode.second} />
      </div>
    </div>
  );
}
