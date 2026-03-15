import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  FilePlus,
  FolderPlus,
  Pencil,
  Copy,
  Shield,
  Download,
  Trash2,
  Info,
} from "lucide-react";
import type { SftpEntry } from "@/stores/ssh-types";
import { formatSize } from "@/utils/format-size";

interface SftpContextMenuProps {
  x: number;
  y: number;
  entry: SftpEntry | null;
  parentPath: string;
  credentials: Record<string, unknown>;
  onClose: () => void;
  onRefresh: () => void;
}

export function SftpContextMenu({
  x,
  y,
  entry,
  parentPath,
  credentials,
  onClose,
  onRefresh,
}: SftpContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
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

  const handleNewFile = useCallback(async () => {
    const name = window.prompt("New file name:");
    if (!name?.trim()) return;
    const path = parentPath.endsWith("/")
      ? `${parentPath}${name.trim()}`
      : `${parentPath}/${name.trim()}`;
    try {
      await invoke("sftp_create_file", { ...credentials, path });
      onRefresh();
    } catch (e) {
      alert(`Create file failed: ${e}`);
    }
    onClose();
  }, [credentials, parentPath, onRefresh, onClose]);

  const handleNewFolder = useCallback(async () => {
    const name = window.prompt("New folder name:");
    if (!name?.trim()) return;
    const path = parentPath.endsWith("/")
      ? `${parentPath}${name.trim()}`
      : `${parentPath}/${name.trim()}`;
    try {
      await invoke("sftp_mkdir", { ...credentials, path });
      onRefresh();
    } catch (e) {
      alert(`Create folder failed: ${e}`);
    }
    onClose();
  }, [credentials, parentPath, onRefresh, onClose]);

  const handleRename = useCallback(async () => {
    if (!entry) return;
    const newName = window.prompt("New name:", entry.name);
    if (!newName?.trim() || newName === entry.name) return;
    const parentDir = entry.path.substring(
      0,
      entry.path.lastIndexOf("/") + 1,
    );
    try {
      await invoke("sftp_rename", {
        ...credentials,
        oldPath: entry.path,
        newPath: `${parentDir}${newName.trim()}`,
      });
      onRefresh();
    } catch (e) {
      alert(`Rename failed: ${e}`);
    }
    onClose();
  }, [entry, credentials, onRefresh, onClose]);

  const handleCopy = useCallback(async () => {
    if (!entry || entry.is_dir) return;
    const dst = window.prompt("Copy to path:", `${entry.path}.copy`);
    if (!dst?.trim()) return;
    try {
      await invoke("sftp_copy", {
        ...credentials,
        srcPath: entry.path,
        dstPath: dst.trim(),
      });
      onRefresh();
    } catch (e) {
      alert(`Copy failed: ${e}`);
    }
    onClose();
  }, [entry, credentials, onRefresh, onClose]);

  const handleChmod = useCallback(async () => {
    if (!entry) return;
    const octal = window.prompt(
      "Permissions (octal):",
      entry.permissions.toString(8).padStart(3, "0"),
    );
    if (!octal?.trim()) return;
    const perm = parseInt(octal.trim(), 8);
    if (isNaN(perm) || perm < 0 || perm > 0o777) {
      alert("Invalid permissions. Use octal format (e.g., 755).");
      return;
    }
    try {
      await invoke("sftp_chmod", { ...credentials, path: entry.path, permissions: perm });
      onRefresh();
    } catch (e) {
      alert(`Chmod failed: ${e}`);
    }
    onClose();
  }, [entry, credentials, onRefresh, onClose]);

  const handleDownload = useCallback(async () => {
    if (!entry || entry.is_dir) return;
    const localPath = await save({ defaultPath: entry.name });
    if (!localPath) return;
    try {
      await invoke("sftp_download", {
        ...credentials,
        remotePath: entry.path,
        localPath,
      });
    } catch (e) {
      alert(`Download failed: ${e}`);
    }
    onClose();
  }, [entry, credentials, onClose]);

  const handleDelete = useCallback(async () => {
    if (!entry) return;
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    try {
      await invoke("sftp_delete", {
        ...credentials,
        path: entry.path,
        isDir: entry.is_dir,
      });
      onRefresh();
    } catch (e) {
      alert(`Delete failed: ${e}`);
    }
    onClose();
  }, [entry, credentials, onRefresh, onClose]);

  const handleProperties = useCallback(() => {
    if (!entry) return;
    const perms = entry.permissions.toString(8).padStart(3, "0");
    const date = new Date(entry.modified * 1000).toLocaleString();
    alert(
      `Name: ${entry.name}\nPath: ${entry.path}\nType: ${entry.is_dir ? "Directory" : "File"}\nSize: ${formatSize(entry.size)}\nPermissions: ${perms}\nModified: ${date}`,
    );
    onClose();
  }, [entry, onClose]);

  // Build menu items based on context
  const items: { icon: typeof FilePlus; label: string; action: () => void }[] =
    [];

  // Always show create actions
  items.push({ icon: FilePlus, label: "New File", action: handleNewFile });
  items.push({ icon: FolderPlus, label: "New Folder", action: handleNewFolder });

  // Entry-specific actions
  if (entry) {
    items.push({ icon: Pencil, label: "Rename", action: handleRename });
    if (!entry.is_dir) {
      items.push({ icon: Copy, label: "Copy", action: handleCopy });
      items.push({ icon: Download, label: "Download", action: handleDownload });
    }
    items.push({ icon: Shield, label: "Chmod", action: handleChmod });
    items.push({ icon: Info, label: "Properties", action: handleProperties });
    items.push({ icon: Trash2, label: "Delete", action: handleDelete });
  }

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
