# Phase 4: Session Management

## Context
- [Claude store](../../src/stores/claude-store.ts) — current `claudeSessionId` tracking
- [CLI session flags](../../plans/reports/researcher-260321-claude-cli-subprocess-research.md) — `--resume`, `--continue`, `--session-id`

## Overview
- **Priority:** Medium
- **Status:** Pending
- Manage conversation sessions: new, continue, history list, persist across app restarts

## Key Insights
- Claude CLI stores sessions in `~/.claude/projects/` directory
- `--resume <session-id>` resumes specific session
- `--continue` resumes most recent session in CWD
- Session ID returned in `result` event — already captured in store
- Current implementation loses session on app restart (state in memory only)

## Requirements

### Functional
- "New conversation" button resets chat and creates fresh session
- Session ID persisted to localStorage per pane
- On app restart, offer to continue last session
- Session indicator in header shows session status (new/resumed)

### Non-functional
- Session restore < 100ms
- No stale session IDs causing CLI errors (handle gracefully)

## Related Code Files

### Modify
- `src/stores/claude-store.ts` — Persist session IDs, add session management actions
- `src/components/claude-chat-pane.tsx` — Session controls in header

## Implementation Steps

1. **Store: session persistence** (`claude-store.ts`)
   - On `handleStreamLine` result event: save `sessionId` to `localStorage`
     - Key: `claude-session-${paneId}`
   - On `ensureState`: load sessionId from localStorage if available
   - Add `newSession(paneId)` — clear messages, clear sessionId, remove from localStorage
   - Add `continueSession(paneId, projectPath)` — send `--continue` flag instead of `--resume`

2. **Backend: continue flag** (`claude_manager.rs`)
   - Add optional `continue_session: bool` param to `claude_send_message`
   - When true, add `--continue` flag instead of `--resume <id>`

3. **UI: session controls** (`claude-chat-pane.tsx`)
   - Header dropdown or buttons:
     - "New" — calls `newSession()`
     - Session badge: "Session: abc123..." (truncated) or "New session"
   - On mount with existing sessionId: auto-use `--resume` on next message

## Todo List
- [ ] Persist session IDs to localStorage
- [ ] Load session IDs on init
- [ ] Add new/continue session actions
- [ ] Add --continue flag support in Rust
- [ ] Session indicator in header
- [ ] Handle stale session errors gracefully

## Success Criteria
- Session survives app restart
- New conversation starts fresh
- Resume shows previous conversation context
- Stale session ID doesn't crash — falls back to new session
