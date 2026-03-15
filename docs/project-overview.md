# DevTools Project Overview

## Purpose

DevTools is a lightweight, extensible desktop application for developers to manage projects with integrated terminal, git operations, and code editor functionality. Built with Tauri v2, React, and TypeScript, it provides a VS Code-like IDE interface with minimal resource overhead.

## Key Features

### Terminal View (Ctrl+1)
- Multi-pane terminal emulator with xterm.js
- Binary tree split layout (horizontal/vertical)
- Per-project terminal sessions persisted to disk
- ANSI color support, mouse events, link detection

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
- **AppStore** — Current view (terminal/git/editor), global UI state
- **ProjectStore** — Open project tabs, active tab tracking
- **PaneStore** — Terminal split pane tree per project
- **GitStore** — Staged/unstaged files, selected file, commit state
- **EditorStore** — Open file tabs, active file, dirty tracking, cursor position

### Backend (Rust/Tauri)
- **file_ops.rs** — Read/write files with path validation
- **git_ops.rs** — Execute git commands via CLI
- **pty_manager.rs** — Create/manage PTY instances
- **session_store.rs** — Load/save terminal sessions to ~/.devtools/sessions/

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
| Global | Next project tab | `Ctrl+Tab` |
| Global | Prev project tab | `Ctrl+Shift+Tab` |
| Terminal | Split horizontal | `Ctrl+Shift+H` |
| Terminal | Split vertical | `Ctrl+Shift+V` |
| Terminal | Close pane | `Ctrl+W` |
| Editor | Save file | `Ctrl+S` |
| Editor | Close file | `Ctrl+W` |
| Git | Commit | `Ctrl+Enter` |
| Git | Stage file | `S` (selected) |
| Git | Unstage file | `U` (selected) |

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
