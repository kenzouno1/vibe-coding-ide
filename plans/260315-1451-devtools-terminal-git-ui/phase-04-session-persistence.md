# Phase 4: Session Persistence

## Priority: Medium
## Status: Pending

## Overview
Save/restore terminal sessions per project. Remember working directory, pane layout, shell history.

## Storage
- `~/.devtools/sessions/{project-hash}.json`
- Schema: `{ project: string, cwd: string, panes: PaneTree, tabs: Tab[] }`

## Files
- `src-tauri/session_store.rs` — read/write session JSON
- `stores/session-store.ts` — frontend state
- `components/project-selector.tsx` — project picker dropdown

## Steps
1. Rust: session file read/write commands
2. On app close: save current pane layout + cwds
3. On app open: restore last session for selected project
4. Project selector: scan recent projects, switch sessions
5. Tab management: add/close/rename tabs

## Success Criteria
- Close app, reopen → same panes restored
- Switch projects → different terminal sessions load
