import { useEffect } from "react";
import { useGitStore } from "@/stores/git-store";
import { useProjectStore } from "@/stores/project-store";
import { CommitBox } from "@/components/commit-box";
import { DiffViewer } from "@/components/diff-viewer";
import { GitBranch, Plus, Minus, RefreshCw } from "lucide-react";

interface GitPanelProps {
  projectPath: string;
}

export function GitPanel({ projectPath }: GitPanelProps) {
  const refresh = useGitStore((s) => s.refresh);
  const stageFile = useGitStore((s) => s.stageFile);
  const unstageFile = useGitStore((s) => s.unstageFile);
  const selectFile = useGitStore((s) => s.selectFile);
  const gitState = useGitStore((s) => s.getState(projectPath));
  const activeTabPath = useProjectStore((s) => s.activeTabPath);

  const { branch, files, selectedFile, diff, loading } = gitState;
  const isActiveTab = activeTabPath === projectPath;

  // Auto-refresh: only poll when this tab is active
  useEffect(() => {
    if (!isActiveTab) return;

    refresh(projectPath);

    const interval = setInterval(() => refresh(projectPath), 10000);
    const onFocus = () => refresh(projectPath);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [projectPath, refresh, isActiveTab]);

  const staged = files.filter((f) => f.staged);
  const unstaged = files.filter((f) => !f.staged);

  return (
    <div className="h-full flex flex-col bg-ctp-base text-ctp-text">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ctp-surface0">
        <GitBranch size={14} className="text-ctp-mauve" />
        <span className="text-sm font-medium text-ctp-subtext1">
          {branch || "No branch"}
        </span>
        <button
          onClick={() => refresh(projectPath)}
          className="ml-auto p-1 rounded hover:bg-ctp-surface0 text-ctp-overlay1"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File list sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-ctp-surface0 overflow-y-auto">
          <FileSection
            title="Staged"
            files={staged}
            selectedFile={selectedFile}
            onSelect={(f) => selectFile(projectPath, f.path, true)}
            action={(f) => (
              <button
                onClick={(e) => { e.stopPropagation(); unstageFile(projectPath, f.path); }}
                className="p-0.5 rounded hover:bg-ctp-surface1 text-ctp-red"
                title="Unstage"
              >
                <Minus size={12} />
              </button>
            )}
          />
          <FileSection
            title="Changes"
            files={unstaged}
            selectedFile={selectedFile}
            onSelect={(f) => selectFile(projectPath, f.path, false)}
            action={(f) => (
              <button
                onClick={(e) => { e.stopPropagation(); stageFile(projectPath, f.path); }}
                className="p-0.5 rounded hover:bg-ctp-surface1 text-ctp-green"
                title="Stage"
              >
                <Plus size={12} />
              </button>
            )}
          />
        </div>

        {/* Diff viewer */}
        <div className="flex-1 overflow-auto">
          {diff ? (
            <DiffViewer diff={diff} />
          ) : (
            <div className="flex items-center justify-center h-full text-ctp-overlay0 text-sm">
              Select a file to view diff
            </div>
          )}
        </div>
      </div>

      <CommitBox projectPath={projectPath} />
    </div>
  );
}

interface FileSectionProps {
  title: string;
  files: { path: string; status: string; staged: boolean }[];
  selectedFile: string | null;
  onSelect: (f: { path: string; status: string; staged: boolean }) => void;
  action: (f: { path: string; status: string; staged: boolean }) => React.ReactNode;
}

const STATUS_COLORS: Record<string, string> = {
  M: "text-ctp-yellow",
  A: "text-ctp-green",
  D: "text-ctp-red",
  "?": "text-ctp-overlay1",
  R: "text-ctp-blue",
};

function FileSection({ title, files, selectedFile, onSelect, action }: FileSectionProps) {
  if (files.length === 0) return null;

  return (
    <div>
      <div className="px-3 py-1.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide">
        {title} ({files.length})
      </div>
      {files.map((f) => (
        <div
          key={`${f.staged}-${f.path}`}
          onClick={() => onSelect(f)}
          className={`flex items-center gap-2 px-3 py-1 cursor-pointer text-sm hover:bg-ctp-surface0 ${
            selectedFile === f.path ? "bg-ctp-surface0" : ""
          }`}
        >
          <span className={`font-mono text-xs w-4 ${STATUS_COLORS[f.status] || "text-ctp-text"}`}>
            {f.status}
          </span>
          <span className="truncate flex-1">{f.path}</span>
          {action(f)}
        </div>
      ))}
    </div>
  );
}
