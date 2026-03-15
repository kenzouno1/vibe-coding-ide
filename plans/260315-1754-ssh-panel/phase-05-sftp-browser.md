# Phase 5: SFTP File Browser

## Context
- [file-explorer.tsx](../../src/components/file-explorer.tsx) — reference for tree browser UI
- [file-tree-node.tsx](../../src/components/file-tree-node.tsx) — reference for recursive tree node
- Depends on Phase 1 (SFTP backend) and Phase 3 (store)

## Overview
- **Priority:** P1
- **Status:** done
- **Effort:** 2.5h

## Key Insights
- Same tree pattern as file-explorer but calls `sftp_list_dir` instead of `list_directory`
- Download/upload via context menu or toolbar buttons
- Use `tauri-plugin-dialog` (already installed) for save/open file dialogs
- Show file metadata: size, permissions, modified date

## Files to Create
- `src/components/sftp-browser.tsx` (~130 lines)
- `src/components/sftp-tree-node.tsx` (~110 lines)

## Implementation Steps

### 1. Create sftp-tree-node.tsx
Similar to file-tree-node.tsx but:
- Calls `sftp_list_dir` instead of `list_directory`
- Needs sessionId prop to pass to SFTP commands
- Shows size column (formatted: KB/MB/GB)
- Double-click file → download dialog
- No editor integration (remote files not opened in Monaco)

```typescript
interface SftpTreeNodeProps {
  entry: SftpEntry;
  depth: number;
  sessionId: string;
  onContextMenu: (e: React.MouseEvent, entry: SftpEntry) => void;
  onDownload: (remotePath: string) => void;
}
```

### 2. Create sftp-browser.tsx
Similar to file-explorer.tsx but:
- Header shows current remote path with navigation
- Breadcrumb path bar for quick nav (click segment to jump)
- Toolbar: Upload, New Folder, Refresh
- Upload button → open file dialog → invoke `sftp_upload`
- Download via context menu on file nodes

```typescript
interface SftpBrowserProps {
  sessionId: string;
}

export function SftpBrowser({ sessionId }: SftpBrowserProps) {
  // State: currentPath (default "/"), entries, loading
  // Load entries via invoke("sftp_list_dir", { id: sessionId, path: currentPath })
  // Upload: open() dialog → invoke("sftp_upload", { id, localPath, remotePath })
  // Download: save() dialog → invoke("sftp_download", { id, remotePath, localPath })
}
```

### 3. Context menu for SFTP
Simple inline context menu (not a separate component initially — YAGNI):
- File: Download, Delete
- Directory: Open, New Folder, Delete
- Can reuse pattern from file-context-menu.tsx if needed

### 4. File size formatting utility
```typescript
// src/utils/format-size.ts (~10 lines)
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}
```

## Todo
- [ ] Create format-size.ts utility
- [ ] Create sftp-tree-node.tsx
- [ ] Create sftp-browser.tsx with toolbar + tree
- [ ] Implement upload flow (dialog → invoke)
- [ ] Implement download flow (context menu → dialog → invoke)
- [ ] Test directory browsing and file operations

## Success Criteria
- Browse remote filesystem tree
- Upload local file to remote path
- Download remote file to local path
- Create/delete remote directories
- File sizes displayed correctly

## Risk
- Large directories: SFTP list may be slow. Consider loading indicator per node (already in file-tree-node pattern).
- Binary file handling: download is byte-level, no encoding issues
