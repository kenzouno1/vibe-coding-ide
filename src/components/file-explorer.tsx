import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, FilePlus, FolderPlus } from "lucide-react";
import { FileTreeNode, type DirEntry } from "@/components/file-tree-node";
import { FileContextMenu } from "@/components/file-context-menu";

interface FileExplorerProps {
  projectPath: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  entry: DirEntry | null;
}

export function FileExplorer({ projectPath }: FileExplorerProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const projectName = projectPath.split(/[/\\]/).pop() ?? projectPath;

  const loadRoot = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<DirEntry[]>("list_directory", { path: projectPath });
      setEntries(result);
    } catch (err) {
      console.error("Failed to list root directory:", err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: DirEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleNewFile = useCallback(async () => {
    const name = window.prompt("New file name:");
    if (!name?.trim()) return;
    try {
      await invoke("create_file", { path: `${projectPath}/${name.trim()}` });
      loadRoot();
    } catch (err) {
      console.error("Failed to create file:", err);
    }
  }, [projectPath, loadRoot]);

  const handleNewFolder = useCallback(async () => {
    const name = window.prompt("New folder name:");
    if (!name?.trim()) return;
    try {
      await invoke("create_directory", { path: `${projectPath}/${name.trim()}` });
      loadRoot();
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
  }, [projectPath, loadRoot]);

  return (
    <div
      className="h-full flex flex-col bg-ctp-mantle select-none"
      onContextMenu={(e) => handleContextMenu(e, null)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ctp-surface0">
        <span className="text-xs font-semibold text-ctp-overlay1 uppercase tracking-wider truncate">
          {projectName}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewFile}
            title="New File"
            className="p-1 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
          >
            <FilePlus size={14} />
          </button>
          <button
            onClick={handleNewFolder}
            title="New Folder"
            className="p-1 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={loadRoot}
            title="Refresh"
            className="p-1 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {entries.map((entry) => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            projectPath={projectPath}
            onContextMenu={(e, ent) => handleContextMenu(e, ent)}
          />
        ))}
        {!loading && entries.length === 0 && (
          <div className="text-center text-ctp-overlay0 text-xs py-4">Empty directory</div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          parentPath={projectPath}
          onClose={() => setContextMenu(null)}
          onRefresh={loadRoot}
        />
      )}
    </div>
  );
}
