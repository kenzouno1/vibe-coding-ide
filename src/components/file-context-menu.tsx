import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { DirEntry } from "@/components/file-tree-node";

interface FileContextMenuProps {
  x: number;
  y: number;
  entry: DirEntry | null;
  /** Parent directory path (used for "new file/folder" in empty space) */
  parentPath: string;
  onClose: () => void;
  onRefresh: () => void;
}

export function FileContextMenu({
  x, y, entry, parentPath, onClose, onRefresh,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [inputValue, setInputValue] = useState("");

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const targetDir = entry?.is_dir ? entry.path : parentPath;

  const handleNewFile = useCallback(() => {
    setCreating("file");
    setInputValue("");
  }, []);

  const handleNewFolder = useCallback(() => {
    setCreating("folder");
    setInputValue("");
  }, []);

  const handleRename = useCallback(() => {
    if (!entry) return;
    setRenaming(true);
    setInputValue(entry.name);
  }, [entry]);

  const handleDelete = useCallback(async () => {
    if (!entry) return;
    const confirmed = window.confirm(`Delete "${entry.name}"?`);
    if (!confirmed) return;
    try {
      await invoke("delete_entry", { path: entry.path });
      onRefresh();
    } catch (err) {
      console.error("Delete failed:", err);
    }
    onClose();
  }, [entry, onClose, onRefresh]);

  const handleInputSubmit = useCallback(async () => {
    const name = inputValue.trim();
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return;

    try {
      // Use platform-aware path separator
      const sep = targetDir.includes("\\") ? "\\" : "/";
      if (creating === "file") {
        await invoke("create_file", { path: `${targetDir}${sep}${name}` });
      } else if (creating === "folder") {
        await invoke("create_directory", { path: `${targetDir}${sep}${name}` });
      } else if (renaming && entry) {
        // Get parent dir by finding the last separator
        const lastSep = Math.max(entry.path.lastIndexOf("/"), entry.path.lastIndexOf("\\"));
        const parentDir = lastSep >= 0 ? entry.path.substring(0, lastSep + 1) : "";
        await invoke("rename_entry", { oldPath: entry.path, newPath: `${parentDir}${name}` });
      }
      onRefresh();
    } catch (err) {
      console.error("File operation failed:", err);
    }
    onClose();
  }, [inputValue, creating, renaming, entry, targetDir, onClose, onRefresh]);

  // Show inline input for create/rename
  if (creating || renaming) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-ctp-surface0 border border-ctp-surface1 rounded shadow-lg p-2"
        style={{ left: x, top: y }}
      >
        <input
          autoFocus
          className="bg-ctp-base text-ctp-text text-sm px-2 py-1 rounded border border-ctp-surface1 outline-none focus:border-ctp-mauve w-48"
          placeholder={creating ? `New ${creating} name...` : "New name..."}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleInputSubmit();
            if (e.key === "Escape") onClose();
          }}
        />
      </div>
    );
  }

  const items = [
    { icon: FilePlus, label: "New File", action: handleNewFile },
    { icon: FolderPlus, label: "New Folder", action: handleNewFolder },
    ...(entry
      ? [
          { icon: Pencil, label: "Rename", action: handleRename },
          { icon: Trash2, label: "Delete", action: handleDelete },
        ]
      : []),
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-ctp-surface0 border border-ctp-surface1 rounded shadow-lg py-1 min-w-[140px]"
      style={{ left: x, top: y }}
    >
      {items.map(({ icon: Icon, label, action }) => (
        <button
          key={label}
          onClick={action}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-ctp-text hover:bg-ctp-surface1 transition-colors"
        >
          <Icon size={14} className="text-ctp-overlay1" />
          {label}
        </button>
      ))}
    </div>
  );
}
