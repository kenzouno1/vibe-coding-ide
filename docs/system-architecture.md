# System Architecture — DevTools

## High-Level Overview

DevTools is a Tauri v2 desktop application with a React/TypeScript frontend and Rust backend. It provides four main views (Terminal, Git, Editor, SSH) for each open project, with per-project isolated state and session persistence.

```
┌─────────────────────────────────────────┐
│         React Frontend (TypeScript)      │
│  ┌──────────────────────────────────┐   │
│  │ Views: Terminal|Git|Editor|SSH   │   │
│  │ Sidebar Navigation (Ctrl+1/2/3/4/5)│  │
│  └──────────────────────────────────┘   │
│              Zustand Stores              │
│  App | Project | Pane | Git | Editor|SSH│
└────────────────────┬────────────────────┘
                     │ IPC (Tauri)
                     ↓
┌─────────────────────────────────────────┐
│   Rust Backend (Tauri v2 Commands)      │
│  ┌──────────────────────────────────┐   │
│  │ file_ops | git_ops | pty_mgr    │   │
│  │ ssh_manager | sftp_ops | ssh_.. │   │
│  │ session_store                    │   │
│  └──────────────────────────────────┘   │
│         OS Integration Layer             │
│  File I/O | Git CLI | PTY | SSH | SFTP │
└─────────────────────────────────────────┘
```

## Frontend Architecture

### View Layer (React Components)

#### Terminal View (`terminal-pane.tsx`, `split-pane-container.tsx`)
- Renders pane tree from PaneStore
- Xterm.js instances per pane
- Delegates keyboard input to terminal
- Preserves pane layout during view switch

#### Git View (`git-panel.tsx`, `commit-box.tsx`, `diff-viewer.tsx`)
- File list (staged/unstaged) from GitStore
- Selection and staging via keyboard/click
- Diff viewer with syntax highlighting
- Commit message input and submission

#### Editor View (`editor-view.tsx`, `editor-pane.tsx`, `file-explorer.tsx`)
- File explorer tree (left pane, resizable)
- Tab bar showing open files
- Monaco Editor instance (right pane)
- Tab close buttons and context menu

#### Browser View (`browser-view.tsx`, `browser-url-bar.tsx`)
- Native Tauri secondary webview for rendering web pages
- URL bar with navigation (back/forward/refresh)
- Per-project browser state (each tab has independent browser instance)
- ResizeObserver for positioning native webview within React container

#### SSH View (`ssh-panel.tsx`, `ssh-terminal.tsx`, `sftp-browser.tsx`)
- Split layout: left-side SFTP file tree, right-side SSH terminal (xterm.js)
- SSH preset management (load/save/delete connection profiles)
- SSH terminal with async command input/output via russh
- SFTP file browser with drag-drop support, context menu for delete/download
- Per-project SSH connection state and SFTP tree cache
- Terminal resizing synchronization with remote PTY

### State Management (Zustand)

#### AppStore
```typescript
type AppView = "terminal" | "git" | "editor" | "ssh";
interface: { view, setView }
```
Global UI state only. Persisted to localStorage optionally.

#### ProjectStore
```typescript
interface: {
  openTabs: Tab[],        // {path, name}
  activeTabPath: string,  // Active project path
  setActiveTab,
  addTab,
  removeTab
}
```
Tracks which projects are open. Per-app state (not per-project).

#### PaneStore (Terminal)
```typescript
interface: {
  panes: Record<projectPath, PaneNode>,  // Binary tree
  getActiveId,
  split,       // Create new pane
  closePane,
  setActivePane
}
```
Each project has its own pane tree. PaneNode contains `{ id, layout, left/right }`.

#### GitStore
```typescript
interface: {
  states: Record<projectPath, GitState>,  // Per-project git state
  files: FileStatus[],      // Staged/unstaged
  selectedFile: string | null,
  commitMsg: string,
  getState,
  stageFile,
  unstageFile,
  setCommitMsg,
  commit,
  refreshStatus
}
```
Fetches git status via backend `git_status` command.

#### EditorStore
```typescript
interface: {
  states: Record<projectPath, ProjectEditorState>,
  openFiles: EditorFileTab[],     // {filePath, content, isDirty, language}
  activeFilePath: string | null,
  openFile,      // Invokes read_file
  closeFile,
  setActiveFile,
  setDirty,
  saveFile,      // Invokes write_file
  getState
}
```
Manages file tabs, content, and dirty tracking per project.

#### BrowserStore
```typescript
interface: {
  states: Record<projectPath, BrowserState>,  // Per-project browser state
  url: string,
  isLoading: boolean,
  canGoBack: boolean,
  canGoForward: boolean,
  setUrl,
  setLoading,
  setNavState,
  getState
}
```
Manages browser navigation state per project. Webview instance created lazily on first activation.

#### SSHStore
```typescript
interface: {
  states: Record<projectPath, SSHState>,  // Per-project SSH state
  presets: SSHPreset[],                   // Saved connection presets
  activeConnection: SSHConnection | null,
  connected: boolean,
  terminalOutput: string,
  sftpNodes: SFTPNode[],
  connect,       // Connect to saved preset
  disconnect,
  writeInput,    // Send command to SSH terminal
  resizeTerminal,
  loadPresets,   // Load from ~/.devtools/ssh-presets.json
  savePreset,
  deletePreset,
  listSFTPFiles
}
```
Manages SSH connections, presets, and SFTP file browser state per project.

### Hooks

#### `use-keyboard-shortcuts.ts`
Global event handler for Ctrl+1/2/3 view switching, Ctrl+Tab project switching, and view-specific shortcuts.

#### `use-pty.ts`
Creates xterm.js instances and connects to PTY backend via IPC.

#### `use-ssh.ts`
Creates xterm.js instance for SSH terminal and connects to SSH backend via IPC. Applies shared xterm configuration.

#### `use-session-persistence.ts`
Loads/saves project sessions from `~/.devtools/sessions/` on mount/unmount.

#### `use-ime-handler.ts`
Handles IME (input method) composition events for non-Latin keyboards.

### Utils

#### `language-detect.ts`
Maps file extensions to Monaco editor language IDs (e.g., `.rs` → `rust`, `.tsx` → `typescript`).

#### `file-icons.ts`
Returns Lucide icon for file type (e.g., File, Code, Settings, Folder).

#### `monaco-catppuccin-theme.ts`
Defines Catppuccin Mocha theme colors and registers with Monaco Editor.

#### `xterm-config.ts`
Shared xterm.js configuration (DRY) for Terminal and SSH views. Defines colors, fonts, options.

#### `format-size.ts`
Utility to format file sizes (bytes → KB/MB/GB) for SFTP browser display.

## Backend Architecture (Rust)

### Command Handlers (lib.rs)
IPC interface exposed to frontend:

```rust
#[tauri::command]
async fn read_file(path: String) -> Result<String, String>

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String>

#[tauri::command]
async fn git_status(project: String) -> Result<GitStatus, String>

#[tauri::command]
async fn git_commit(project: String, msg: String) -> Result<(), String>

// PTY commands managed via session store
```

### file_ops.rs (File I/O)
```rust
pub fn read_file(path: &str) -> Result<String, String>
  └─ Validates path (no .., no absolute outside project)
  └─ Returns file content as string

pub fn write_file(path: &str, content: &str) -> Result<(), String>
  └─ Validates path
  └─ Writes content to file (creates parent dirs if needed)
  └─ Returns success or error
```

Security: Uses `canonicalize()` to validate paths are within project.

### git_ops.rs (Git CLI)
```rust
pub fn git_status(project: &str) -> Result<GitStatus, String>
  └─ Runs: git status --porcelain --branch
  └─ Parses output into {files, branch, ahead, behind}

pub fn git_commit(project: &str, msg: &str) -> Result<(), String>
  └─ Stages all files (git add -A)
  └─ Commits with message (git commit -m)
  └─ Returns success or error message
```

Uses subprocess with argument arrays (safe against injection).

### pty_manager.rs (Terminal Backend)
```rust
pub fn create_pty(cwd: &str) -> Result<PtyHandle, String>
  └─ Creates platform-specific PTY (conpty on Windows, unix PTY on macOS/Linux)
  └─ Starts shell (cmd.exe on Windows, bash/zsh on Unix)
  └─ Returns handle for I/O

pub fn write_input(handle: &PtyHandle, data: &str)
  └─ Writes user input to PTY stdin

pub fn read_output(handle: &PtyHandle) -> Result<String, String>
  └─ Reads PTY output (ANSI codes preserved)
```

Uses `portable-pty` crate for cross-platform PTY management.

### session_store.rs (Session Persistence)
```rust
pub fn save_session(project: &str, panes: PaneTree) -> Result<(), String>
  └─ Serializes pane tree to JSON
  └─ Saves to ~/.devtools/sessions/{project}.json

pub fn load_session(project: &str) -> Result<PaneTree, String>
  └─ Loads pane tree from disk
  └─ Returns panes or error
```

Allows terminal panes to survive app restart.

### ssh_manager.rs (SSH Connection)
```rust
pub async fn connect(host: &str, port: u16, user: &str, auth: AuthMethod)
  -> Result<SSHSession, String>
  └─ Initiates SSH connection via russh
  └─ Supports password and key-based auth
  └─ Returns session handle for I/O

pub async fn write_input(session: &mut SSHSession, cmd: &str) -> Result<(), String>
  └─ Sends command to SSH terminal channel

pub async fn read_output(session: &SSHSession) -> Result<String, String>
  └─ Reads SSH channel output (preserves ANSI codes)

pub async fn resize_terminal(session: &mut SSHSession, cols: u32, rows: u32)
  -> Result<(), String>
  └─ Requests PTY resize on remote

pub async fn disconnect(session: SSHSession) -> Result<(), String>
  └─ Closes SSH session gracefully
```

Uses `russh` async SSH client. Manages PTY allocation and channel I/O.

### sftp_ops.rs (SFTP File Operations)
```rust
pub async fn list_dir(session: &SFTPSession, path: &str)
  -> Result<Vec<SFTPFile>, String>
  └─ Lists directory contents with metadata
  └─ Returns name, size, permissions, mtime

pub async fn download_file(session: &SFTPSession, remote: &str, local: &str)
  -> Result<(), String>

pub async fn upload_file(session: &SFTPSession, local: &str, remote: &str)
  -> Result<(), String>

pub async fn delete_file(session: &SFTPSession, path: &str) -> Result<(), String>
```

Uses `russh-sftp` for SFTP protocol. Integrates with SSH session from ssh_manager.

### ssh_presets.rs (Connection Presets)
```rust
pub fn load_presets() -> Result<Vec<SSHPreset>, String>
  └─ Loads presets from ~/.devtools/ssh-presets.json

pub fn save_preset(preset: SSHPreset) -> Result<(), String>
  └─ Appends/updates preset to file

pub fn delete_preset(name: &str) -> Result<(), String>
  └─ Removes preset by name
```

Persists connection details (host, port, user, auth method) for quick reconnect.

## Data Flow Examples

### Opening a File in Editor
```
User clicks file in explorer
  ↓
FileExplorer calls openFile(projectPath, filePath)
  ↓
EditorStore.openFile() invokes read_file(filePath)
  ↓
IPC → file_ops.rs read_file()
  ↓
Returns file content to frontend
  ↓
EditorStore creates EditorFileTab
  ↓
EditorPane renders Monaco Editor with content
```

### Committing Changes in Git
```
User types commit message and presses Ctrl+Enter
  ↓
CommitBox dispatches gitCommit(projectPath)
  ↓
GitStore.commit() invokes git_commit(projectPath, msg)
  ↓
IPC → git_ops.rs git_commit()
  ↓
Runs: git add -A && git commit -m "{msg}"
  ↓
Returns success to frontend
  ↓
GitStore calls refreshStatus()
  ↓
GitPanel re-renders with updated file list
```

### Terminal Output
```
User types command and presses Enter
  ↓
Terminal captures input (not via keyboard handler)
  ↓
TerminalPane writes input to PTY via IPC
  ↓
pty_manager.rs processes input, returns output
  ↓
xterm.js renders output in terminal
  ↓
PaneStore tracks active pane
```

### SSH Connection and Terminal I/O
```
User selects preset and clicks "Connect"
  ↓
SSHPanel calls connectSSH(preset)
  ↓
SSHStore invokes ssh_connect(host, user, auth)
  ↓
IPC → ssh_manager.rs async connect()
  ↓
russh establishes session, allocates PTY
  ↓
Returns session handle to frontend
  ↓
SSHStore.connected = true, SSHPanel renders terminal

User types command in SSH terminal
  ↓
SSHTerminal captures input via xterm.js
  ↓
Invokes ssh_write_input(sessionId, cmd)
  ↓
IPC → ssh_manager.rs async write_input()
  ↓
Writes to SSH channel, reads output
  ↓
Returns output to frontend
  ↓
xterm.js renders output in SSH terminal
```

### SFTP File Browsing
```
User opens SSH view (connected)
  ↓
SFTPBrowser invokes ssh_list_sftp("/")
  ↓
IPC → sftp_ops.rs async list_dir()
  ↓
Uses SFTP session to list remote directory
  ↓
Returns file list with metadata (size, mtime, perms)
  ↓
SSHStore.sftpNodes updated
  ↓
SFTPBrowser renders tree with file icons and sizes

User clicks file to download
  ↓
SSHPanel invokes ssh_download_file(remote, localPath)
  ↓
IPC → sftp_ops.rs async download_file()
  ↓
Transfers file via SFTP
  ↓
Returns success to frontend
```

## Project Isolation Model

Each open project (tab) has completely isolated state:

### Terminal
- Separate pane tree per project
- Each pane has unique PTY instance
- Session saved/loaded per project

### Git
- Separate file list, selection, commit message
- Status fetched from project directory
- Operations scoped to project

### Editor
- Separate open file tabs
- Separate view states (scroll, cursor)
- Files opened relative to project root

### SSH
- Separate SSH connection per project (one active at a time)
- SFTP tree cache isolated to connection
- SSH session handle held in store until disconnect

### Switching Projects
Switching tabs via Ctrl+Tab hides the previous project's panels and shows the active project's panels. No reload/recreation occurs; state is preserved.

## View State Persistence

On app startup:
1. Load open project tabs from ProjectStore (or localStorage)
2. For each project:
   - Load terminal pane tree from session_store
   - Load git status (if git view was active)
   - Load editor open files (if editor view was active)

On app close:
- Save current project tabs
- Save each project's terminal sessions
- Autosave editor file content (optional)

## Performance Considerations

### Terminal
- Limit PTY buffer to 10KB per pane (drop old output)
- Batch xterm.js writes for performance
- Lazy-load panes only when visible

### Git
- Cache git status for 2 seconds
- Debounce file system watchers
- Limit diff viewer to first 1000 lines

### Editor
- Lazy-load Monaco Editor instance on view switch
- Debounce file saving to 500ms
- Cache language detection results

## Security Model

### File Access
- Validate all paths against project root
- Prevent path traversal (`..` sequences)
- Reject absolute paths outside project
- Log suspicious requests

### Git Operations
- Escape/validate all git arguments
- Use subprocess args array (not shell string)
- Limit git command execution time

### Terminal
- Sanitize terminal output (ANSI codes OK, no raw HTML)
- Monitor resource usage (memory, processes)
- Prevent infinite loops in PTY I/O

## Extension Points (Future)

### Plugin System
- Load plugins from `~/.devtools/plugins/`
- Plugin API: register commands, keybindings, UI panels

### Custom Themes
- Store themes in `~/.devtools/themes/`
- Apply theme to editor and UI

### Language Servers
- Integrate LSP for code completion, diagnostics
- Per-project `.devtools/lsp.json` configuration
