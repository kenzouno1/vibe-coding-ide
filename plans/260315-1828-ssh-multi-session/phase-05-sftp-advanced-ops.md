# Phase 5: SFTP Advanced Operations

## Context
- [sftp_ops.rs](../../src-tauri/src/sftp_ops.rs) — existing SFTP backend (list/download/upload/mkdir/delete)
- [sftp-browser.tsx](../../src/components/sftp-browser.tsx) — existing SFTP UI
- [sftp-tree-node.tsx](../../src/components/sftp-tree-node.tsx) — tree node with context menu
- Independent of other phases — can be implemented in parallel

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 2h

## Current State
Existing SFTP ops: `sftp_list_dir`, `sftp_download`, `sftp_upload`, `sftp_mkdir`, `sftp_delete`

## New Operations Needed

### Backend (Rust — sftp_ops.rs)

| Command | Description | russh-sftp API |
|---------|-------------|----------------|
| `sftp_create_file` | Create empty file on remote | `sftp.create(path)` |
| `sftp_chmod` | Change file/dir permissions | `sftp.set_metadata(path, metadata)` |
| `sftp_rename` | Move or rename file/dir | `sftp.rename(old, new)` |
| `sftp_copy` | Copy file (read + write on remote) | `sftp.open(src)` → read → `sftp.create(dst)` → write |
| `sftp_stat` | Get file metadata (for properties dialog) | `sftp.metadata(path)` |

### Frontend (React)

#### Enhanced Context Menu (sftp-tree-node.tsx)
Current: right-click → confirm delete only
New context menu items:
- **Create File** — prompt name → `sftp_create_file`
- **Create Folder** — prompt name → `sftp_mkdir` (already exists)
- **Rename/Move** — prompt new path → `sftp_rename`
- **Copy** — prompt destination path → `sftp_copy`
- **Chmod** — prompt octal (e.g., "755") → `sftp_chmod`
- **Properties** — show size, permissions, modified date via `sftp_stat`
- **Download** — existing
- **Delete** — existing (with confirm)

#### SFTP Context Menu Component (new: sftp-context-menu.tsx)
- Extracted from inline confirm dialog in sftp-tree-node.tsx
- Reuses pattern from file-context-menu.tsx
- Shows different items for files vs directories

## Implementation Steps

### 1. Add Rust commands to sftp_ops.rs

```rust
#[tauri::command]
pub async fn sftp_create_file(
    host, port, username, auth_method, password, private_key_path,
    path: String,
) -> Result<(), String>
// sftp.create(path) → immediately close

#[tauri::command]
pub async fn sftp_chmod(
    host, port, username, auth_method, password, private_key_path,
    path: String,
    permissions: u32,  // octal e.g. 0o755
) -> Result<(), String>
// sftp.set_metadata(path, Metadata { permissions: Some(perm), ..Default::default() })

#[tauri::command]
pub async fn sftp_rename(
    host, port, username, auth_method, password, private_key_path,
    old_path: String,
    new_path: String,
) -> Result<(), String>
// sftp.rename(old_path, new_path)

#[tauri::command]
pub async fn sftp_copy(
    host, port, username, auth_method, password, private_key_path,
    src_path: String,
    dst_path: String,
) -> Result<(), String>
// open src → read_to_end → create dst → write_all

#[tauri::command]
pub async fn sftp_stat(
    host, port, username, auth_method, password, private_key_path,
    path: String,
) -> Result<SftpEntry, String>
// sftp.metadata(path) → convert to SftpEntry
```

### 2. Register commands in lib.rs
```rust
sftp_ops::sftp_create_file,
sftp_ops::sftp_chmod,
sftp_ops::sftp_rename,
sftp_ops::sftp_copy,
sftp_ops::sftp_stat,
```

### 3. Create sftp-context-menu.tsx
- Similar to file-context-menu.tsx pattern
- Props: x, y, entry, credentials, onClose, onRefresh
- Menu items with icons from lucide-react:
  - FilePlus (Create File), FolderPlus (New Folder)
  - Pencil (Rename), Copy (Copy), Move (Move = rename to different path)
  - Shield (Chmod), Info (Properties)
  - Download, Trash2 (Delete)

### 4. Update sftp-tree-node.tsx
- Replace inline `window.confirm` with `onContextMenu` callback
- Pass context menu event up to sftp-browser.tsx

### 5. Update sftp-browser.tsx
- Add context menu state management
- Render SftpContextMenu component
- Add "Create File" button to toolbar header
- Wire up all new operations via store credentials

## Files to Create
- `src/components/sftp-context-menu.tsx` (~130 lines)

## Files to Modify
- `src-tauri/src/sftp_ops.rs` — add 5 new commands (~80 lines)
- `src-tauri/src/lib.rs` — register 5 new commands
- `src/components/sftp-tree-node.tsx` — emit context menu event instead of inline confirm
- `src/components/sftp-browser.tsx` — add context menu + Create File toolbar button

## Todo
- [ ] Add sftp_create_file, sftp_chmod, sftp_rename, sftp_copy, sftp_stat to sftp_ops.rs
- [ ] Register new commands in lib.rs
- [ ] Create sftp-context-menu.tsx component
- [ ] Update sftp-tree-node.tsx to use context menu callback
- [ ] Update sftp-browser.tsx with context menu state + Create File button
- [ ] Test all operations

## Success Criteria
- Create empty file on remote server
- Rename/move files and directories
- Copy files on remote server
- Change permissions (chmod) with octal input
- View file properties (size, permissions, modified date)
- Context menu appears on right-click with appropriate options

## Risk
- `sftp_copy` for large files: same RAM issue as download/upload. Acceptable for MVP (config/code files).
- Permission denied errors: show user-visible error in SFTP browser error banner.
