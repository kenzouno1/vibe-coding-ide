import { GitBranch } from "lucide-react";
import { useGitStore } from "@/stores/git-store";
import { useProjectStore } from "@/stores/project-store";

export function StatusBar() {
  const activeTabPath = useProjectStore((s) => s.activeTabPath);
  const gitState = useGitStore((s) => s.getState(activeTabPath || ""));

  const { branch, files } = gitState;
  const fileCount = files.length;

  return (
    <div className="h-7 flex items-center px-2 bg-ctp-mantle border-t border-ctp-surface0 text-xs text-ctp-overlay1 gap-3">
      {branch && (
        <div className="flex items-center gap-1">
          <GitBranch size={12} />
          <span>{branch}</span>
        </div>
      )}
      {fileCount > 0 && (
        <span>{fileCount} change{fileCount !== 1 ? "s" : ""}</span>
      )}
      <div className="ml-auto flex items-center gap-3">
        <span>Ctrl+1 Terminal</span>
        <span>Ctrl+2 Git</span>
        <span>Ctrl+Tab Switch tab</span>
      </div>
    </div>
  );
}
