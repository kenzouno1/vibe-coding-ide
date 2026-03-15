---
title: "SSH Multi-Session: Tabs, Split Panes, AI Agent CLI"
description: "Add multi-tab SSH sessions, split terminal panes, and AI agent CLI integration to existing SSH panel"
status: pending
priority: P1
effort: 12h
branch: feat/ssh-multi-session
tags: [ssh, terminal, tabs, split-panes, ai-agent, tauri]
created: 2026-03-15
---

# SSH Multi-Session Enhancement Plan

## Summary

Four incremental enhancements to existing SSH panel:
1. **Multi-tab sessions** — tab bar over SSH panel, each tab = independent SSH connection + SFTP state
2. **Split terminal panes** — reuse pane-store binary tree pattern for SSH channels within a session
3. **AI Agent CLI** — local WebSocket server exposing SSH session I/O for external agents

## Architecture Overview

```
SSH Tab Bar (new: ssh-tab-bar.tsx)
  ├── Tab 1: Session "prod-server"
  │     ├── SFTP Browser (left, per-session state)
  │     └── Split Pane Container (right)
  │           ├── Pane A → SSH Channel 1 (xterm.js)
  │           └── Pane B → SSH Channel 2 (xterm.js)
  ├── Tab 2: Session "staging"
  │     └── ...
  └── [+] → Preset Manager

Backend (Rust):
  SshState {
    sessions: HashMap<session_id, SshSessionEntry> {
      handle: client::Handle,
      channels: HashMap<channel_id, Arc<Channel>>  // multi-channel support
    }
  }

  AgentServer (new):
    WebSocket on localhost:9876
    Commands: list_sessions, write, read_output, execute, resize
```

## Phase Overview

| Phase | File | Status | Effort |
|-------|------|--------|--------|
| 1. Multi-channel backend | [phase-01](phase-01-multi-channel-backend.md) | pending | 2h |
| 2. SSH tab store + tab bar UI | [phase-02](phase-02-ssh-tabs.md) | pending | 2h |
| 3. Split pane SSH terminals | [phase-03](phase-03-split-panes.md) | pending | 2.5h |
| 4. AI Agent WebSocket server | [phase-04](phase-04-agent-cli.md) | pending | 3.5h |
| 5. SFTP advanced operations | [phase-05](phase-05-sftp-advanced-ops.md) | pending | 2h |

## Key Dependencies

- Phase 2 depends on Phase 1 (multi-channel IPC commands)
- Phase 3 depends on Phase 2 (tab context for pane trees)
- Phase 4 is independent (can parallel with Phase 2-3, only needs Phase 1)
- Phase 5 is independent (can parallel with all other phases)

## Key Decisions

1. **Multi-channel via russh** — SSH2 protocol supports multiple channels per connection. Reuse existing `client::Handle`, open additional channels via `channel_open_session()`. Each pane = separate channel.
2. **Event routing** — Change `ssh-output` event payload to include `channel_id` (not just `session_id`) so each pane receives only its own output.
3. **SFTP state per session** — Move `sftpPath`/`sftpEntries` from global ssh-store into per-session state inside `connections` map.
4. **Agent API via WebSocket** — Local-only WS server (localhost-bound). Simpler than named pipes, works cross-platform, agents can use any WS client. Secured via single-use token generated at startup.
