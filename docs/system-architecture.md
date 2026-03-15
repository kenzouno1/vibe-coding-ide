# System Architecture — DevTools

## High-Level Overview

DevTools is a Tauri v2 desktop application with a React/TypeScript frontend and Rust backend. It provides three main views (Terminal, Git, Editor) for each open project, with per-project isolated state and session persistence.

```
┌─────────────────────────────────────────┐
│         React Frontend (TypeScript)      │
│  ┌──────────────────────────────────┐   │
│  │ Views: Terminal | Git | Editor   │   │
│  │ Sidebar Navigation (Ctrl+1/2/3)  │   │
│  └──────────────────────────────────┘   │
│              Zustand Stores              │
│  App | Project | Pane | Git | Editor    │
└────────────────────┬────────────────────┘
                     │ IPC (Tauri)
                     ↓
┌─────────────────────────────────────────┐
│   Rust Backend (Tauri v2 Commands)      │
│  ┌──────────────────────────────────┐   │
│  │ file_ops   | git_ops | pty_mgr  │   │
│  │ session_store                    │   │
│  └──────────────────────────────────┘   │
│         OS Integration Layer             │
│  File I/O | Git CLI | PTY | Clipboard  │
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

### State Management (Zustand)

#### AppStore
```typescript
type AppView = "terminal" | "git" | "editor";
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

### Hooks

#### `use-keyboard-shortcuts.ts`
Global event handler for Ctrl+1/2/3 view switching, Ctrl+Tab project switching, and view-specific shortcuts.

#### `use-pty.ts`
Creates xterm.js instances and connects to PTY backend via IPC.

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
