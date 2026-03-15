---
type: planner
date: 2026-03-15
plan: plans/260315-1754-ssh-panel
---

# SSH Panel - Plan Summary

## What
MobaXterm-style SSH view for DevTools: connection presets, SFTP file browser (left 30%), SSH terminal (right 70%).

## Architecture
- **Backend:** `ssh_manager.rs` (connect/write/resize/disconnect + reader thread), `sftp_ops.rs` (list/upload/download/mkdir/delete), `ssh_presets.rs` (CRUD to ~/.devtools/ssh-presets.json)
- **Frontend:** `ssh-store.ts` (zustand), `use-ssh.ts` (hook mirroring use-pty.ts), `ssh-terminal.tsx`, `sftp-browser.tsx`, `ssh-preset-manager.tsx`, `ssh-panel.tsx` (split layout)
- **Integration:** AppView extended to "ssh", sidebar gets Monitor icon, app.tsx renders SshPanel

## 7 Phases (~12h total)
1. **Rust SSH backend** (3h) — ssh2 crate, session mgmt, event streaming, SFTP commands
2. **SSH presets persistence** (1h) — JSON CRUD to ~/.devtools/
3. **SSH store** (1.5h) — zustand store, AppView extension
4. **SSH terminal** (2h) — xterm.js + use-ssh hook, extract shared theme (DRY)
5. **SFTP browser** (2.5h) — tree view mirroring file-explorer, upload/download
6. **Panel integration** (1.5h) — ssh-panel.tsx split layout, sidebar, app.tsx wiring
7. **Preset manager UI** (1h) — preset list/form, connect flow

## Key Risks
- **ssh2 on Windows:** may need `vendored-openssl` feature flag
- **ssh2 Channel not Send:** may need per-session dedicated thread with mpsc command channel
- **Blocking I/O:** all ssh2 calls must run off main thread

## Files Created/Modified Summary
| Action | File |
|--------|------|
| Create | `src-tauri/src/ssh_manager.rs` |
| Create | `src-tauri/src/sftp_ops.rs` |
| Create | `src-tauri/src/ssh_presets.rs` |
| Create | `src/stores/ssh-store.ts` |
| Create | `src/types/ssh-types.ts` |
| Create | `src/hooks/use-ssh.ts` |
| Create | `src/components/ssh-terminal.tsx` |
| Create | `src/components/sftp-browser.tsx` |
| Create | `src/components/sftp-tree-node.tsx` |
| Create | `src/components/ssh-panel.tsx` |
| Create | `src/components/ssh-preset-manager.tsx` |
| Create | `src/components/ssh-preset-form.tsx` |
| Create | `src/utils/xterm-config.ts` |
| Create | `src/utils/format-size.ts` |
| Modify | `src-tauri/Cargo.toml` |
| Modify | `src-tauri/src/lib.rs` |
| Modify | `src/stores/app-store.ts` |
| Modify | `src/components/sidebar.tsx` |
| Modify | `src/app.tsx` |
| Modify | `src/components/terminal-pane.tsx` (DRY: use shared theme) |
