import { useEffect, useState, useCallback } from "react";
import { useGitStore } from "@/stores/git-store";
import { useProjectStore } from "@/stores/project-store";
import { CommitBox } from "@/components/commit-box";
import { DiffViewer } from "@/components/diff-viewer";
import { Plus, Minus, RefreshCw, ChevronRight, ChevronDown, Folder } from "lucide-react";
import { GitBranchBar } from "@/components/git-branch-bar";
import { GitTagPopover } from "@/components/git-tag-popover";

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
        <GitBranchBar projectPath={projectPath} />
        <div className="ml-auto flex items-center gap-1">
          <GitTagPopover projectPath={projectPath} />
          <button
            onClick={() => refresh(projectPath)}
            className="p-1 rounded hover:bg-ctp-surface0 text-ctp-overlay1"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
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

type GitFile = { path: string; status: string; staged: boolean };

interface FileSectionProps {
  title: string;
  files: GitFile[];
  selectedFile: string | null;
  onSelect: (f: GitFile) => void;
  action: (f: GitFile) => React.ReactNode;
}

const STATUS_COLORS: Record<string, string> = {
  M: "text-ctp-yellow",
  A: "text-ctp-green",
  D: "text-ctp-red",
  "?": "text-ctp-overlay1",
  R: "text-ctp-blue",
};

/** Build a nested tree from flat file paths */
interface TreeNode {
  name: string;
  fullPath: string;
  file?: GitFile;
  children: TreeNode[];
}

function buildTree(files: GitFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const f of files) {
    const parts = f.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;

      let existing = current.find((n) => n.fullPath === fullPath);
      if (!existing) {
        existing = { name, fullPath, children: [], ...(isFile ? { file: f } : {}) };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  return root;
}

function FileSection({ title, files, selectedFile, onSelect, action }: FileSectionProps) {
  // Track collapsed folders — all expanded by default
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (files.length === 0) return null;

  const tree = buildTree(files);

  return (
    <div>
      <div className="px-3 py-1.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide">
        {title} ({files.length})
      </div>
      {tree.map((node) => (
        <TreeItem
          key={node.fullPath}
          node={node}
          depth={0}
          selectedFile={selectedFile}
          onSelect={onSelect}
          action={action}
          collapsed={collapsed}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (f: GitFile) => void;
  action: (f: GitFile) => React.ReactNode;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
}

function TreeItem({ node, depth, selectedFile, onSelect, action, collapsed, onToggle }: TreeItemProps) {
  const isDir = !node.file;
  const isCollapsed = collapsed.has(node.fullPath);
  const paddingLeft = 12 + depth * 16;

  if (isDir) {
    return (
      <>
        <div
          onClick={() => onToggle(node.fullPath)}
          className="flex items-center gap-1.5 py-1 cursor-pointer text-sm hover:bg-ctp-surface0 text-ctp-subtext1"
          style={{ paddingLeft }}
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <Folder size={12} className="text-ctp-blue" />
          <span className="truncate">{node.name}</span>
        </div>
        {!isCollapsed &&
          node.children.map((child) => (
            <TreeItem
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
              action={action}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
      </>
    );
  }

  const f = node.file!;
  return (
    <div
      onClick={() => onSelect(f)}
      className={`flex items-center gap-2 py-1 cursor-pointer text-sm hover:bg-ctp-surface0 ${
        selectedFile === f.path ? "bg-ctp-surface0" : ""
      }`}
      style={{ paddingLeft }}
    >
      <span className={`font-mono text-xs w-4 ${STATUS_COLORS[f.status] || "text-ctp-text"}`}>
        {f.status}
      </span>
      <span className="truncate flex-1">{node.name}</span>
      {action(f)}
    </div>
  );
}
