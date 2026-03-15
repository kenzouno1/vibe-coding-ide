# Tech Stack

## Framework
- **Tauri v2** — Lightweight desktop shell (~5MB installer), Rust backend
- **React 19** + **TypeScript** — Frontend UI in webview
- **Vite** — Bundler (fast HMR)

## Terminal
- **xterm.js 5.x** — Terminal emulator in webview
- **portable-pty (Rust)** — PTY backend (conpty on Windows)
- **Custom split layout** — Flex-based binary tree pane manager

## Git Integration
- **git CLI** — Shell out to OS git (reuse existing tool)
- **diff2html** — Diff rendering (inline + side-by-side)

## State & Storage
- **Zustand** — Lightweight state management
- **JSON files** — Per-project session persistence (~/.devtools/sessions/)

## Styling
- **Tailwind CSS** — Utility-first styling
- **shadcn/ui** — Accessible component primitives

## Build & Package
- **Tauri bundler** — .msi (Windows), .dmg (macOS), .deb/.AppImage (Linux)

## Key Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop framework | Tauri v2 | Lightweight (~5MB), Rust perf, small memory footprint |
| Git operations | git CLI | Reuse OS tool, no lib deps, full git feature set |
| Terminal backend | portable-pty | Rust-native PTY, conpty on Windows |
| Diff renderer | diff2html | Lightweight, syntax highlighting, multiple view modes |
| State mgmt | Zustand | Minimal boilerplate |
| Bundler | Vite | Fast HMR, Tauri-native integration |
