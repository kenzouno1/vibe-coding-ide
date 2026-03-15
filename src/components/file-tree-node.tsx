import { useState, useCallback, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Loader2 } from "lucide-react";
import { getFileIcon } from "@/utils/file-icons";
import { useEditorStore } from "@/stores/editor-store";

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  extension: string;
}

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  projectPath: string;
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void;
}

export const FileTreeNode = memo(function FileTreeNode({ entry, depth, projectPath, onContextMenu }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const activeFilePath = useEditorStore((s) => s.getState(projectPath).activeFilePath);
  const openFile = useEditorStore((s) => s.openFile);

  const isActive = entry.path === activeFilePath;

  const toggleExpand = useCallback(async () => {
    if (!entry.is_dir) return;

    if (!expanded && children === null) {
      setLoading(true);
      try {
        const result = await invoke<DirEntry[]>("list_directory", { path: entry.path });
        setChildren(result);
      } catch (err) {
        console.error("Failed to list directory:", err);
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((prev) => !prev);
  }, [entry.is_dir, entry.path, expanded, children]);

  const handleClick = useCallback(() => {
    if (entry.is_dir) {
      toggleExpand();
    } else {
      openFile(projectPath, entry.path);
    }
  }, [entry.is_dir, entry.path, projectPath, openFile, toggleExpand]);

  const FileIcon = getFileIcon(entry.extension);

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer text-sm select-none ${
          isActive
            ? "bg-ctp-surface1 text-ctp-mauve"
            : "text-ctp-text hover:bg-ctp-surface0"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, entry)}
      >
        {/* Expand/collapse indicator for directories */}
        {entry.is_dir ? (
          loading ? (
            <Loader2 size={14} className="animate-spin text-ctp-overlay0 flex-shrink-0" />
          ) : expanded ? (
            <ChevronDown size={14} className="text-ctp-overlay1 flex-shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-ctp-overlay1 flex-shrink-0" />
          )
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}

        {/* Icon */}
        {entry.is_dir ? (
          expanded ? (
            <FolderOpen size={14} className="text-ctp-yellow flex-shrink-0" />
          ) : (
            <Folder size={14} className="text-ctp-yellow flex-shrink-0" />
          )
        ) : (
          <FileIcon size={14} className="text-ctp-overlay1 flex-shrink-0" />
        )}

        {/* Name */}
        <span className="truncate">{entry.name}</span>
      </div>

      {/* Render children if expanded */}
      {expanded && children && children.map((child) => (
        <FileTreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          projectPath={projectPath}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
});
