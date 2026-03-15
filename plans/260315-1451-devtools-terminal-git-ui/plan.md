# DevTools — Terminal + Git UI

## Overview
Desktop dev tools app: split-pane terminal with session persistence + git diff/commit UI.

**Stack:** Tauri v2 + React 19 + TypeScript + Vite + Tailwind + shadcn/ui
**Theme:** Catppuccin Mocha

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | Tauri + React scaffold | pending | project root |
| 2 | Terminal (xterm.js + PTY) | pending | src/, src-tauri/ |
| 3 | Split pane manager | pending | src/components/ |
| 4 | Session persistence | pending | src-tauri/, src/stores/ |
| 5 | Git diff + commit UI | pending | src/components/, src-tauri/ |
| 6 | App shell (sidebar, status bar) | pending | src/components/ |
| 7 | Keyboard shortcuts | pending | src/hooks/ |
| 8 | Build + package | pending | src-tauri/ |

## Key Dependencies
- Rust + Cargo (user installing)
- Node.js v24 (available)
- Tauri v2 CLI
- xterm.js, portable-pty (Rust), diff2html
