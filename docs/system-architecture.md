# System Architecture — DevTools

## High-Level Overview

DevTools is a Tauri v2 desktop application with a React/TypeScript frontend and Rust backend. It provides core views (Terminal, Git, Editor, Settings) with optional plugin views (SSH is the first plugin), integrated panes (Terminal, Claude Chat, Browser) in the terminal view, and per-project and per-pane isolated state.

```
┌──────────────────────────────────────────────┐
│      React Frontend (TypeScript)             │
│  Core Views: Terminal|Git|Editor|Settings    │
│  Plugin Views: SSH (optional, user-enabled)  │
│  Sidebar (Ctrl+1/2/3)                        │
│  Panes: Terminal|Claude|Browser (Terminal)  │
│  Zustand: App|Project|Pane|Git|Editor|Claude│
│          |Browser|SSH|Plugin                │
└────────────────┬─────────────────────────────┘
                 │ IPC (Tauri) + WebSocket (Agent)
                 ↓
┌──────────────────────────────────────────────┐
│  Rust Backend (Tauri v2 Commands)            │
│  file_ops | git_ops | pty_mgr | ssh_mgr    │
│  sftp_ops | claude_mgr | agent_server      │
│  browser_ops (per-pane webview mgmt)       │
│         OS Integration Layer                 │
│  File I/O | Git CLI | PTY | SSH | SFTP     │
└──────────────────────────────────────────────┘
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

#### Browser Pane (`browser-pane.tsx`, `browser-url-bar.tsx`)
- Native Tauri secondary webview for rendering web pages (one per pane)
- URL bar with navigation (back/forward/refresh)
- Per-pane browser state (multiple browsers per project via paneId keying)
- F5/F12 shortcuts work when browser pane is focused in terminal view
- ResizeObserver for positioning native webview within React container
- Pin mode to keep visible across view switches
- Float mode for overlay positioning

#### SSH View (`ssh-panel.tsx`, `ssh-terminal.tsx`, `sftp-browser.tsx`, `ssh-editor-pane.tsx`)
- Split layout: left-side SFTP file tree, right-side SSH terminal (xterm.js)
- SSH preset management (load/save/delete connection profiles)
- SSH terminal with async command input/output via russh
- SFTP file browser with drag-drop support, context menu for delete/download
- SSH editor pane: edit remote files in Monaco (SFTP download → edit → save)
- Per-project SSH connection state and SFTP tree cache
- Terminal resizing synchronization with remote PTY

#### Claude Chat Pane (`claude-chat-pane.tsx`, `claude-input.tsx`, `claude-message-list.tsx`)
- Embedded AI chat in terminal pane splits (via Ctrl+Shift+C)
- Slash commands (local: /clear, /new, /cost, /help; global: ~/.claude/commands/)
- File attachments: clipboard (image/PDF), drag-drop, file picker
- Model selector (Default, Opus 4.6, Sonnet 4.6, Haiku 4.5)
- Permission modes (Default, Plan, Accept Edits, Bypass, Ask)
- Streaming with tool use blocks, cost tracking, session persistence

### State Management (Zustand)

#### AppStore
```typescript
type CoreView = "terminal" | "git" | "editor" | "settings";
type AppView = CoreView | (string & {}); // Supports plugin view IDs
interface: { view, setView }
```
Global UI state only. AppView supports both core views and plugin view IDs (string type). Browser moved to pane type.

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

#### PaneStore (Terminal + Claude + Browser)
```typescript
interface: {
  trees: Record<projectPath, PaneNode>,  // Binary tree per project
  activeIds: Record<projectPath, string>,
  getActiveId,
  split,       // Create new pane with type
  closePane,
  setActive,
  toggleDirection,  // Swap split orientation
  getPaneType      // Get pane type by leaf ID
}
type PaneNode = { id, type: "leaf"|"split", paneType?: "terminal"|"claude"|"browser" }
```
Each project has its own pane tree. Panes are leaf nodes (terminal, claude chat, or browser).

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
  states: Record<paneId, BrowserState>,  // Per-pane browser state
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
Manages browser navigation state per pane. Supports multiple browser panes per project (keyed by paneId). Webview instance created lazily on first activation.

#### SSHStore
```typescript
interface: {
  states: Record<projectPath, SSHState>,  // Per-project SSH state
  presets: SSHPreset[],                   // Saved connection presets
  activeConnection: SSHConnection | null,
  connected: boolean,
  terminalOutput: string,
  sftpNodes: SFTPNode[],
  connect, disconnect, writeInput, resizeTerminal, loadPresets, savePreset, deletePreset
}
```
Manages SSH connections, presets, and SFTP file browser state per project.

#### ClaudeStore
```typescript
interface: {
  panes: Record<paneId, ClaudeState>,  // Per-pane chat state
  messages: Message[],
  streaming: boolean,
  model, permissions, cost,
  attachments: Attachment[],
  sendMessage, cancelStream, setModel, setPermissions
}
type Message = { role, content, toolUse?: ToolBlock[] }
```
Manages Claude chat per pane. NDJSON backend streaming, slash command dispatch, localStorage persistence.

#### PluginStore
```typescript
interface: {
  enabledIds: string[],  // List of enabled plugin IDs
  isEnabled: (id: string) => boolean,
  toggle: (id: string) => void,
  enable: (id: string) => void,
  disable: (id: string) => void
}
```
Manages plugin enable/disable state (persisted to localStorage). When a plugin is disabled, app falls back to terminal view if currently viewing that plugin.

### Plugin System Architecture

#### Plugin Registry
- **Location**: `src/plugins/plugin-registry.ts`
- **Pattern**: Plugins register themselves at import time via `registerPlugin(descriptor)`
- **Registry**: Global array of PluginDescriptor objects
- **Functions**: `registerPlugin()`, `getPlugins()`, `getPlugin(id)`

#### Plugin Descriptor Interface
```typescript
interface PluginDescriptor {
  id: string,                          // Unique plugin ID
  name: string,                        // Display name
  description: string,                 // Short description
  icon: LucideIcon,                    // Sidebar icon
  viewId: string,                      // Unique view ID for routing
  ViewComponent: LazyExoticComponent,  // Lazy-loaded React component
  shortcuts?: PluginShortcut[],        // Optional keyboard shortcuts
  sidebarOrder?: number                // Sidebar position (lower = higher)
}
```

#### Plugin Example: SSH
- **File**: `src/plugins/ssh-plugin.ts`
- **View ID**: "ssh"
- **Sidebar Order**: 40 (appears after core views)
- **Shortcut**: Ctrl+4 to activate SSH view
- **Component**: `SshPanel` (lazy-loaded)

#### Plugin Integration Points
1. **Sidebar**: Dynamically renders enabled plugin nav items below core views
2. **Routing**: App.tsx renders plugin views via Suspense + React.lazy
3. **Keyboard Shortcuts**: `use-keyboard-shortcuts.ts` dynamically registers plugin shortcuts
4. **Settings**: "Plugins" panel in Settings view lists available plugins with enable/disable toggles

### Hooks

#### `use-keyboard-shortcuts.ts`
Global event handler for Ctrl+1/2/3 view switching, Ctrl+Tab project switching, and view-specific shortcuts.

#### `use-pty.ts`
Creates xterm.js instances and connects to PTY backend via IPC.

#### `use-ssh.ts`
Creates xterm.js instance for SSH terminal and connects to SSH backend via IPC. Applies shared xterm configuration.

#### `use-session-persistence.ts`
Loads/saves project sessions from `~/.devtools/sessions/` on mount/unmount.

#### `use-claude.ts` (new)
Manages Claude chat stream via IPC: send_message, cancel, discover commands, check installation.

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

### ssh_manager.rs + sftp_ops.rs (SSH/SFTP)
```rust
async fn connect(host, port, user, auth) -> SSHSession  // via russh
async fn write_input(session, cmd) -> ()                 // Send command
async fn read_output(session) -> String                  // Read ANSI output
async fn resize_terminal(session, cols, rows) -> ()      // PTY resize
async fn list_dir(session, path) -> Vec<SFTPFile>       // SFTP list
async fn download_file(session, remote, local) -> ()    // SFTP download
async fn upload_file(session, local, remote) -> ()      // SFTP upload
async fn delete_file(session, path) -> ()               // SFTP delete
```
SSH via russh, SFTP via russh-sftp. Presets stored at ~/.devtools/ssh-presets.json.

### claude_manager.rs (Claude CLI Subprocess + agent_server.rs)
```rust
async fn send_message(prompt, attachments, model) -> Stream<ClaudeEvent>  // NDJSON
async fn discover_commands() -> Vec<Command>  // ~/.claude/commands/ + project
fn save_temp_file(data, ext) -> String       // Store for attachment passing

// WebSocket agent server (127.0.0.1:9876-9880, token auth)
// Ops: list_sessions, write(sessionId, input), subscribe, execute(sessionId, prompt)
```
Spawns Claude CLI with NDJSON streaming. Agent server enables Claude CLI to interact with live terminals/SSH via WS.

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

### Claude Chat Message Stream
```
User types message, attaches file (paste/drag), presses Enter
  ↓
ClaudeChatPane invokes ClaudeStore.sendMessage(msg, attachments, model, permissions)
  ↓
For each attachment: IPC → claude_save_temp_file() (→ ~/.devtools/tmp/)
  ↓
IPC → claude_send_message(prompt, temp_paths, model)
  ↓
claude_manager.rs spawns: claude [args] --stream --ndjson
  ↓
Streams: system.init { model, cost } | stream_event { type: content_block_delta/start/stop }
  ↓
Frontend yields to ClaudeStore: parsing NDJSON per event type
  ↓
ClaudeChatPane renders messages incrementally (streaming UI)
  ↓
On stream end: ClaudeStore.cost += response.cost, saves session to localStorage

User types /command (e.g., /plan, /clear):
  ↓
Slash command dropdown detects match
  ↓
If local (/clear, /new, /cost): ClaudeStore handles directly
  ↓
If global (discovered): IPC → claude_discover_commands() → dispatch execution
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
