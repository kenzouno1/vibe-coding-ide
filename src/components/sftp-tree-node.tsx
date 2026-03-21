import { useState, useCallback, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Loader2,
} from "lucide-react";
import { formatSize } from "@/utils/format-size";
import type { SftpEntry } from "@/stores/ssh-types";

interface SftpTreeNodeProps {
  entry: SftpEntry;
  depth: number;
  credentials: {
    host: string;
    port: number;
    username: string;
    auth_method: string;
    private_key_path?: string;
  };
  onDownload: (remotePath: string) => void;
  onEdit: (remotePath: string) => void;
  onDelete: (path: string, isDir: boolean) => void;
  onContextMenu: (e: React.MouseEvent, entry: SftpEntry) => void;
}

export const SftpTreeNode = memo(function SftpTreeNode({
  entry,
  depth,
  credentials,
  onDownload,
  onEdit,
  onDelete,
  onContextMenu,
}: SftpTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<SftpEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleExpand = useCallback(async () => {
    if (!entry.is_dir) return;

    if (!expanded && children === null) {
      setLoading(true);
      try {
        const result = await invoke<SftpEntry[]>("sftp_list_dir", {
          ...credentials,
          password: null,
          privateKeyPath: credentials.private_key_path ?? null,
          authMethod: credentials.auth_method,
          path: entry.path,
        });
        setChildren(result);
      } catch (err) {
        console.error("SFTP list failed:", err);
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((prev) => !prev);
  }, [entry.is_dir, entry.path, expanded, children, credentials]);

  const handleClick = useCallback(() => {
    if (entry.is_dir) {
      toggleExpand();
    }
  }, [entry.is_dir, toggleExpand]);

  const handleDoubleClick = useCallback(() => {
    if (!entry.is_dir) {
      onEdit(entry.path);
    }
  }, [entry.is_dir, entry.path, onEdit]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, entry);
    },
    [entry, onContextMenu],
  );

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer text-sm select-none text-ctp-text hover:bg-ctp-surface0"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Expand indicator */}
        {entry.is_dir ? (
          loading ? (
            <Loader2
              size={14}
              className="animate-spin text-ctp-overlay0 flex-shrink-0"
            />
          ) : expanded ? (
            <ChevronDown size={14} className="text-ctp-overlay1 flex-shrink-0" />
          ) : (
            <ChevronRight
              size={14}
              className="text-ctp-overlay1 flex-shrink-0"
            />
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
          <FileText size={14} className="text-ctp-overlay1 flex-shrink-0" />
        )}

        {/* Name */}
        <span className="truncate flex-1">{entry.name}</span>

        {/* Size (files only) */}
        {!entry.is_dir && (
          <span className="text-xs text-ctp-overlay0 flex-shrink-0 ml-2">
            {formatSize(entry.size)}
          </span>
        )}
      </div>

      {/* Children */}
      {expanded &&
        children?.map((child) => (
          <SftpTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            credentials={credentials}
            onDownload={onDownload}
            onEdit={onEdit}
            onDelete={onDelete}
            onContextMenu={onContextMenu}
          />
        ))}
    </div>
  );
});
