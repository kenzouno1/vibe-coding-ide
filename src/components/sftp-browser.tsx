import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { RefreshCw, Upload, FolderPlus, FilePlus } from "lucide-react";
import { SftpTreeNode } from "@/components/sftp-tree-node";
import { SftpContextMenu } from "@/components/sftp-context-menu";
import { useSshStore } from "@/stores/ssh-store";
import type { SftpEntry } from "@/stores/ssh-types";

interface SftpBrowserProps {
  sessionId: string;
}

export function SftpBrowser({ sessionId }: SftpBrowserProps) {
  const sftpPath = useSshStore((s) => s.connections[sessionId]?.sftpPath ?? "/");
  const sftpEntries = useSshStore((s) => s.connections[sessionId]?.sftpEntries ?? []);
  const sftpLoading = useSshStore((s) => s.connections[sessionId]?.sftpLoading ?? false);
  const sftpError = useSshStore((s) => s.connections[sessionId]?.sftpError ?? null);
  const browsePath = useSshStore((s) => s.browsePath);
  const getActiveSftpCredentials = useSshStore((s) => s.getActiveSftpCredentials);
  const [opError, setOpError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: SftpEntry | null;
  } | null>(null);

  // Load root on mount
  useEffect(() => {
    browsePath(sessionId, sftpPath || "/");
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const creds = getActiveSftpCredentials(sessionId);

  const handleRefresh = useCallback(() => {
    setOpError(null);
    browsePath(sessionId, sftpPath);
  }, [browsePath, sessionId, sftpPath]);

  const handleUpload = useCallback(async () => {
    if (!creds) return;
    const filePath = await open({ multiple: false });
    if (!filePath) return;

    const fileName = (filePath as string).split(/[/\\]/).pop() ?? "file";
    const remotePath = sftpPath.endsWith("/")
      ? `${sftpPath}${fileName}`
      : `${sftpPath}/${fileName}`;

    try {
      setOpError(null);
      await invoke("sftp_upload", { ...creds, localPath: filePath as string, remotePath });
      handleRefresh();
    } catch (err) {
      setOpError(`Upload failed: ${err}`);
    }
  }, [creds, sftpPath, handleRefresh]);

  const handleNewFolder = useCallback(async () => {
    if (!creds) return;
    const name = window.prompt("New folder name:");
    if (!name?.trim()) return;

    const path = sftpPath.endsWith("/")
      ? `${sftpPath}${name.trim()}`
      : `${sftpPath}/${name.trim()}`;

    try {
      setOpError(null);
      await invoke("sftp_mkdir", { ...creds, path });
      handleRefresh();
    } catch (err) {
      setOpError(`mkdir failed: ${err}`);
    }
  }, [creds, sftpPath, handleRefresh]);

  const handleNewFile = useCallback(async () => {
    if (!creds) return;
    const name = window.prompt("New file name:");
    if (!name?.trim()) return;
    const path = sftpPath.endsWith("/")
      ? `${sftpPath}${name.trim()}`
      : `${sftpPath}/${name.trim()}`;
    try {
      setOpError(null);
      await invoke("sftp_create_file", { ...creds, path });
      handleRefresh();
    } catch (err) {
      setOpError(`Create file failed: ${err}`);
    }
  }, [creds, sftpPath, handleRefresh]);

  const handleTreeContextMenu = useCallback(
    (e: React.MouseEvent, entry: SftpEntry) => {
      setContextMenu({ x: e.clientX, y: e.clientY, entry });
    },
    [],
  );

  const handleBgContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, entry: null });
    },
    [],
  );

  const handleDownload = useCallback(
    async (remotePath: string) => {
      if (!creds) return;
      const fileName = remotePath.split("/").pop() ?? "file";
      const localPath = await save({ defaultPath: fileName });
      if (!localPath) return;

      try {
        setOpError(null);
        await invoke("sftp_download", { ...creds, remotePath, localPath });
      } catch (err) {
        setOpError(`Download failed: ${err}`);
      }
    },
    [creds],
  );

  const handleDelete = useCallback(
    async (path: string, isDir: boolean) => {
      if (!creds) return;
      try {
        setOpError(null);
        await invoke("sftp_delete", { ...creds, path, isDir });
        handleRefresh();
      } catch (err) {
        setOpError(`Delete failed: ${err}`);
      }
    },
    [creds, handleRefresh],
  );

  // Breadcrumb navigation
  const pathSegments = sftpPath.split("/").filter(Boolean);
  const handleBreadcrumb = useCallback(
    (index: number) => {
      const path = "/" + pathSegments.slice(0, index + 1).join("/");
      browsePath(sessionId, path);
    },
    [pathSegments, browsePath, sessionId],
  );

  // Credentials for tree node (subset without password for display)
  const treeCreds = creds
    ? {
        host: creds.host as string,
        port: creds.port as number,
        username: creds.username as string,
        auth_method: creds.authMethod as string,
        private_key_path: creds.privateKeyPath as string | undefined,
      }
    : null;

  if (!creds) {
    return (
      <div className="h-full flex items-center justify-center text-ctp-overlay0 text-sm">
        No active connection
      </div>
    );
  }

  const displayError = opError || sftpError;

  return (
    <div className="h-full flex flex-col bg-ctp-mantle select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ctp-surface0">
        <span className="text-xs font-semibold text-ctp-overlay1 uppercase tracking-wider">
          SFTP
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
            onClick={handleUpload}
            title="Upload File"
            className="p-1 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
          >
            <Upload size={14} />
          </button>
          <button
            onClick={handleNewFolder}
            title="New Folder"
            className="p-1 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={handleRefresh}
            title="Refresh"
            className="p-1 rounded text-ctp-overlay1 hover:text-ctp-text hover:bg-ctp-surface0 transition-colors"
          >
            <RefreshCw
              size={14}
              className={sftpLoading ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {displayError && (
        <div className="px-3 py-1.5 text-xs text-ctp-red bg-ctp-surface0 border-b border-ctp-surface0">
          {displayError}
        </div>
      )}

      {/* Breadcrumb path bar */}
      <div className="flex items-center gap-0.5 px-3 py-1 border-b border-ctp-surface0 text-xs overflow-x-auto">
        <button
          onClick={() => browsePath(sessionId, "/")}
          className="text-ctp-blue hover:text-ctp-sapphire"
        >
          /
        </button>
        {pathSegments.map((seg, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <span className="text-ctp-overlay0">/</span>
            <button
              onClick={() => handleBreadcrumb(i)}
              className="text-ctp-blue hover:text-ctp-sapphire"
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        onContextMenu={handleBgContextMenu}
      >
        {treeCreds &&
          sftpEntries.map((entry) => (
            <SftpTreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              credentials={treeCreds}
              onDownload={handleDownload}
              onDelete={handleDelete}
              onContextMenu={handleTreeContextMenu}
            />
          ))}
        {!sftpLoading && sftpEntries.length === 0 && !displayError && (
          <div className="text-center text-ctp-overlay0 text-xs py-4">
            Empty directory
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && creds && (
        <SftpContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          parentPath={sftpPath}
          credentials={creds}
          onClose={() => setContextMenu(null)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}
