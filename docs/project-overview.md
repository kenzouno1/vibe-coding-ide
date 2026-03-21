# DevTools Project Overview

## Purpose

DevTools is a lightweight, extensible desktop application for developers to manage projects with integrated terminal, git operations, and code editor functionality. Built with Tauri v2, React, and TypeScript, it provides a VS Code-like IDE interface with minimal resource overhead.

## Key Features

### Terminal View (Ctrl+1)
- Multi-pane terminal emulator with xterm.js
- Binary tree split layout (horizontal/vertical)
- Terminal, Claude Chat (Ctrl+Shift+C), and Browser (Ctrl+Shift+B) pane splits
- Per-project terminal sessions persisted to disk
- ANSI color support, mouse events, link detection
- F5 to refresh browser pane, F12 to open browser DevTools

### Git View (Ctrl+2)
- Git status visualization and file operations
- Staging/unstaging files with keyboard shortcuts
- Commit interface with message input
- Diff viewer with syntax highlighting (inline/split modes)
- Per-project git state management

### Editor View (Ctrl+3)
- Monaco Editor with Catppuccin Mocha theme
- Multi-tab interface with unsaved file indicators
- Hierarchical file explorer with drag-friendly resizing
- Auto-save via Ctrl+S, auto-language detection
- File CRUD context menu with path traversal protection

### SSH View (Ctrl+4)
- Remote terminal with xterm.js
- SFTP file browser (left pane) + SSH terminal (right pane)
- SSH preset management (save/load connection profiles)
- SFTP operations: list, download, upload, delete, mkdir
- SSH editor pane for editing remote files in Monaco

### Claude Chat Pane (Terminal split)
- Embedded AI chat integrated into terminal splits (Ctrl+Shift+C)
- Slash commands: /clear, /new, /cost, /help (local) + global ~/.claude/commands/
- File attachments via clipboard paste, drag-drop, file picker
- Model selector (Default, Opus 4.6, Sonnet 4.6, Haiku 4.5)
- Permission modes: Default, Plan, Accept Edits, Bypass, Ask
- Session persistence via localStorage
- Cost tracking and streaming responses with tool use blocks

### Browser Pane (Ctrl+Shift+B)
- Embedded web preview integrated into terminal splits
- Navigation controls (back/forward/reload)
- Per-pane browser state (multiple browsers per project supported)
- Pin mode to keep visible across view switches
- Float mode for overlay positioning

## Project Structure

```
devtools/
├── src/                       # React frontend
│   ├── components/            # UI components (terminal, git, editor panes)
│   ├── stores/                # Zustand state (app, project, editor, git, pane)
│   ├── hooks/                 # Custom hooks (keyboard, session persistence)
│   ├── utils/                 # Utilities (language detection, icons, theme)
│   └── main.tsx               # App entry point
├── src-tauri/
│   └── src/
│       ├── main.rs            # Tauri setup
│       ├── lib.rs             # Command handlers
│       ├── file_ops.rs        # File I/O with path protection
│       ├── git_ops.rs         # Git CLI operations
│       ├── pty_manager.rs     # Terminal PTY management
│       └── session_store.rs   # Session persistence
├── docs/                      # Documentation
│   ├── design-guidelines.md   # UI/UX patterns, colors, keyboard shortcuts
│   ├── tech-stack.md          # Technology choices and rationale
│   ├── project-overview.md    # This file
│   └── wireframes/            # UI mockups
└── plans/                     # Development phases and reports
```

## Architecture Overview

### Frontend State Management (Zustand)
- **AppStore** — Current view (terminal/git/editor/ssh), global UI state
- **ProjectStore** — Open project tabs, active tab tracking
- **PaneStore** — Terminal/Claude/Browser split pane tree per project, pane type (terminal|claude|browser)
- **GitStore** — Staged/unstaged files, selected file, commit state
- **EditorStore** — Open file tabs, active file, dirty tracking, cursor position
- **ClaudeStore** — Per-pane chat state: messages, streaming, session, cost, model, permissions, attachments
- **BrowserStore** — Per-pane browser state: URL, loading state, navigation capability (keyed by paneId)
- **SSHStore** — SSH connection, presets, SFTP file tree, terminal output
- **SSHEditorStore** — Remote file editing state for SSH editor pane

### Backend (Rust/Tauri)
- **file_ops.rs** — Read/write files with path validation
- **git_ops.rs** — Execute git commands via CLI
- **pty_manager.rs** — Create/manage PTY instances
- **session_store.rs** — Load/save terminal sessions to ~/.devtools/sessions/
- **ssh_manager.rs** — SSH connection lifecycle via russh
- **sftp_ops.rs** — SFTP file operations (list, download, upload, delete)
- **ssh_presets.rs** — Load/save SSH connection presets to ~/.devtools/ssh-presets.json
- **claude_manager.rs** — Claude CLI subprocess with NDJSON streaming
- **agent_server.rs** — WebSocket server (127.0.0.1:9876-9880) for Claude CLI agent integration
- **browser_ops.rs** — Browser webview lifecycle (create, navigate, screenshot)

### IPC Commands
- `read_file(path)` → file content
- `write_file(path, content)` → success/error
- `git_status(project)` → status object
- `git_commit(project, msg)` → success/error
- Terminal I/O via PTY manager

## View State Persistence

Each project tab maintains isolated state:
- Terminal pane layout (split tree structure)
- Git staged/unstaged file lists
- Editor open file tabs, active file, scroll positions
- Cursor positions for each open file

On startup, projects reload saved sessions from disk.

## Keyboard Shortcuts

| View | Action | Shortcut |
|------|--------|----------|
| Global | Switch Terminal | `Ctrl+1` |
| Global | Switch Git | `Ctrl+2` |
| Global | Switch Editor | `Ctrl+3` |
| Global | Switch SSH | `Ctrl+4` |
| Global | Next project tab | `Ctrl+Tab` |
| Global | Prev project tab | `Ctrl+Shift+Tab` |
| Terminal | Split horizontal | `Ctrl+Shift+H` |
| Terminal | Split vertical | `Ctrl+Shift+V` |
| Terminal | Split Claude pane | `Ctrl+Shift+C` |
| Terminal | Split Browser pane | `Ctrl+Shift+B` |
| Terminal | Toggle split direction | `Ctrl+Shift+T` |
| Terminal | Close pane | `Ctrl+W` |
| Terminal | Refresh browser pane | `F5` (when browser focused) |
| Terminal | Open browser DevTools | `F12` (when browser focused) |
| Editor | Save file | `Ctrl+S` |
| Editor | Close file | `Ctrl+W` |
| Git | Commit | `Ctrl+Enter` |
| Git | Stage file | `S` (selected) |
| Git | Unstage file | `U` (selected) |
| SSH | Split horizontal | `Ctrl+Shift+H` |
| SSH | Split vertical | `Ctrl+Shift+V` |

## Design System

### Color Palette (Catppuccin Mocha)
- Base background: #0d1117
- Surface: #161b22
- Text primary: #e6edf3
- Accent blue: #58a6ff
- Accent green: #3fb950
- Accent red: #f85149

### Responsive Design
- Desktop-only (Tauri)
- Minimum window: 800x500px
- Sidebar collapses to icon-only below 1000px width
- Split panes respect 120px minimum size

## Development Workflow

1. **Research** — Explore requirements, validate tech decisions
2. **Planning** — Phase-based breakdown in `plans/` directory
3. **Implementation** — Develop features following code standards
4. **Testing** — Verify functionality, run test suites
5. **Code Review** — Ensure quality and consistency
6. **Documentation** — Update docs in `docs/` directory

See `plans/` for detailed phase breakdowns and research reports.

## Next Steps

- Monitor and maintain existing features
- Gather user feedback on editor and terminal experiences
- Plan additional IDE features (debugging, extensions, plugins)
- Performance optimization for large file handling
- Cross-platform testing (Windows/macOS/Linux)
