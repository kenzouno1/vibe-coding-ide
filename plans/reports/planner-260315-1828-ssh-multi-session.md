---
type: planner
date: 2026-03-15
plan: plans/260315-1828-ssh-multi-session
---

# Planner Report: SSH Multi-Session Enhancement

## Plan Created
`C:/Users/Bug/Desktop/devtools/plans/260315-1828-ssh-multi-session/plan.md`

## Phases (4 total, ~10h effort)

| # | Phase | Effort | Depends | Files Changed |
|---|-------|--------|---------|---------------|
| 1 | Multi-channel backend | 2h | — | ssh_manager.rs, lib.rs |
| 2 | SSH tabs (store + UI) | 2h | P1 | ssh-store.ts, ssh-panel.tsx, use-ssh.ts, +ssh-tab-bar.tsx |
| 3 | Split panes | 2.5h | P1,P2 | ssh-store.ts, ssh-terminal.tsx, +ssh-split-pane-container.tsx, +ssh-terminal-pane.tsx |
| 4 | AI Agent WS server | 3.5h | P1 | +agent_server.rs, +agent_protocol.rs, ssh_manager.rs, lib.rs, Cargo.toml |

## Execution Order
- **Sequential:** P1 → P2 → P3
- **Parallel:** P4 can start alongside P2 (both only need P1)

## Key Architectural Decisions
1. **Multi-channel via russh** — SSH2 supports N channels per connection, each pane = separate channel on same TCP connection
2. **Reuse pane-store as-is** — existing binary tree store works with sessionId as key, zero changes needed
3. **WebSocket for agents** — localhost-bound, token-authenticated, streaming output via broadcast channel
4. **SFTP state per session** — moved from global to per-connection to support independent tabs
5. **Terminal preservation on tab switch** — all sessions stay mounted, toggle CSS visibility to avoid xterm re-init

## Tasks Hydrated
- Task #8: Phase 1 (unblocked)
- Task #9: Phase 2 (blocked by #8)
- Task #10: Phase 3 (blocked by #8, #9)
- Task #11: Phase 4 (blocked by #8)
