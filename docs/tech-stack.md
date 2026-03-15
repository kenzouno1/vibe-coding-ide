# Tech Stack

## Framework
- **Tauri v2** — Lightweight desktop shell (~5MB installer), Rust backend
- **React 19** + **TypeScript** — Frontend UI in webview
- **Vite** — Bundler (fast HMR)

## Terminal
- **xterm.js 5.x** — Terminal emulator in webview
- **portable-pty (Rust)** — PTY backend (conpty on Windows)
- **Custom split layout** — Flex-based binary tree pane manager

## Code Editor
- **Monaco Editor** — VS Code's editor, syntax highlighting, multi-language support
- **@monaco-editor/react** — React wrapper for Monaco
- **Catppuccin Mocha** — Custom theme applied to editor instance
- **Language Detection** — Auto-detect language from file extension

## Git Integration
- **git CLI** — Shell out to OS git (reuse existing tool)
- **diff2html** — Diff rendering (inline + side-by-side)

## SSH & SFTP
- **russh** (Rust) — Async SSH client implementation
- **russh-keys** (Rust) — SSH key loading (OpenSSH, PuTTY formats)
- **russh-sftp** (Rust) — SFTP protocol support over SSH
- **tokio** (Rust) — Async runtime for SSH operations
- **async-trait** (Rust) — Async trait support

## State & Storage
- **Zustand** — Lightweight state management
- **JSON files** — Per-project session persistence (~/.devtools/sessions/)

## Styling
- **Tailwind CSS** — Utility-first styling
- **shadcn/ui** — Accessible component primitives

## File Operations
- **file_ops.rs** (Rust) — Read/write files with path traversal protection
- **Tauri invoke** — IPC for `read_file` and `write_file` commands
- **Editor file I/O** — Async file operations from store actions

## Build & Package
- **Tauri bundler** — .msi (Windows), .dmg (macOS), .deb/.AppImage (Linux)

## Key Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop framework | Tauri v2 | Lightweight (~5MB), Rust perf, small memory footprint |
| Git operations | git CLI | Reuse OS tool, no lib deps, full git feature set |
| Terminal backend | portable-pty | Rust-native PTY, conpty on Windows |
| SSH implementation | russh | Pure Rust async SSH, no OpenSSH dependency |
| SFTP | russh-sftp | Integrated with russh session, async I/O |
| SSH preset storage | JSON file | Lightweight, human-readable ~/.devtools/ssh-presets.json |
| Diff renderer | diff2html | Lightweight, syntax highlighting, multiple view modes |
| State mgmt | Zustand | Minimal boilerplate |
| Bundler | Vite | Fast HMR, Tauri-native integration |
