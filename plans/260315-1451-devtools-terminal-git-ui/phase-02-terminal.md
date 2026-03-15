# Phase 2: Terminal (xterm.js + PTY)

## Priority: Critical
## Status: Pending

## Overview
Integrate xterm.js in frontend with portable-pty Rust backend via Tauri commands.

## Architecture
```
[xterm.js] <--WebSocket/Event--> [Tauri IPC] <--> [portable-pty Rust]
```

## Rust Backend (src-tauri/)
- `pty_manager.rs` — spawn/kill PTY processes, manage sessions
- Use `portable-pty` crate for cross-platform PTY
- Tauri commands: `spawn_pty`, `write_pty`, `resize_pty`, `kill_pty`
- Tauri events: `pty-output` (stream stdout to frontend)

## Frontend (src/)
- `components/terminal-pane.tsx` — xterm.js wrapper
- `hooks/use-pty.ts` — Tauri IPC bridge for PTY ops
- xterm.js addons: FitAddon, WebLinksAddon

## Steps
1. Add `portable-pty` to Cargo.toml
2. Create `pty_manager.rs` with spawn/write/resize/kill
3. Register Tauri commands
4. Install xterm.js + addons in frontend
5. Create TerminalPane component
6. Wire up IPC: keystrokes → PTY, PTY output → xterm.js
7. Test: open terminal, run commands, verify output

## Success Criteria
- Can open terminal pane and run shell commands
- Input/output works bidirectionally
- Terminal auto-fits on resize
