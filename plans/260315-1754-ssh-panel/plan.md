---
title: "SSH Panel - MobaXterm-style SSH + SFTP"
description: "Add SSH view with connection presets, SFTP file browser, and xterm.js SSH terminal"
status: implemented
priority: P1
effort: 12h
branch: feat/ssh-panel
tags: [ssh, sftp, terminal, rust, ssh2]
created: 2026-03-15
---

# SSH Panel Implementation Plan

## Overview

Add a 4th view ("ssh") to DevTools with MobaXterm-style UX: saved connection presets, left-side SFTP file browser, right-side SSH terminal. Reuses existing patterns (xterm.js, event streaming, split handle, file tree).

**Status:** All 7 phases complete. Implementation fully finished.

## Architecture

```
Frontend (React)                        Backend (Rust)
─────────────────                       ──────────────
ssh-store.ts (zustand)                  ssh_manager.rs
  ├── presets[]                           ├── SshState (Arc<Mutex<HashMap>>)
  ├── activeSessionId                     ├── ssh_connect() → session_id
  ├── sftpEntries                         ├── ssh_write() → channel
  └── connectionStatus                    ├── ssh_resize()
                                          ├── ssh_disconnect()
use-ssh.ts (hook)                         ├── sftp_list_dir()
  ├── listen("ssh-output")                ├── sftp_download()
  ├── invoke("ssh_connect")               ├── sftp_upload()
  └── invoke("ssh_write")                 ├── sftp_mkdir()
                                          ├── sftp_delete()
ssh-panel.tsx                             ├── ssh_preset_save()
  ├── SftpBrowser (30%)                   ├── ssh_preset_list()
  ├── SplitHandle                         └── ssh_preset_delete()
  └── SshTerminal (70%)
                                        ssh_presets.rs
ssh-preset-manager.tsx                    └── CRUD for ~/.devtools/ssh-presets.json
```

## Data Structures

### SSH Preset (shared TS/Rust)
```typescript
interface SshPreset {
  id: string;          // uuid
  name: string;        // display name
  host: string;
  port: number;        // default 22
  username: string;
  authMethod: "password" | "key";
  privateKeyPath?: string;
}
```

### SSH Session (Rust internal)
```rust
struct SshSession {
    session: ssh2::Session,
    channel: ssh2::Channel,
    // reader thread streams to frontend via "ssh-output" event
}
```

## Phases

| # | Phase | File | Effort | Status |
|---|-------|------|--------|--------|
| 1 | Rust SSH backend | [phase-01](./phase-01-rust-ssh-backend.md) | 3h | done |
| 2 | SSH presets persistence | [phase-02](./phase-02-ssh-presets.md) | 1h | done |
| 3 | SSH store (frontend) | [phase-03](./phase-03-ssh-store.md) | 1.5h | done |
| 4 | SSH terminal component | [phase-04](./phase-04-ssh-terminal.md) | 2h | done |
| 5 | SFTP file browser | [phase-05](./phase-05-sftp-browser.md) | 2.5h | done |
| 6 | SSH panel + integration | [phase-06](./phase-06-ssh-panel-integration.md) | 1.5h | done |
| 7 | Preset manager UI | [phase-07](./phase-07-preset-manager-ui.md) | 1h | done |

## Dependencies
- Phase 1 → all other phases depend on backend
- Phase 2 → Phase 7 (preset UI needs persistence)
- Phase 3 → Phase 4, 5 (components need store)
- Phase 4, 5 → Phase 6 (panel assembles them)

## Key Decisions
- `ssh2` crate (libssh2 bindings) — mature, widely used, supports SFTP subsystem
- Same event streaming pattern as pty_manager (Tauri emit → frontend listen)
- SSH sessions independent of project tabs (SSH view is connection-based, not project-based)
- Password prompt via frontend dialog (tauri-plugin-dialog already available)
- Private key passphrase handled same way
