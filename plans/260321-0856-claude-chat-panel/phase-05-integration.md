# Phase 5: Integration & Polish

## Context
- [sidebar.tsx](../../src/components/sidebar.tsx) — nav items for views
- [app-store.ts](../../src/stores/app-store.ts) — AppView type
- [use-keyboard-shortcuts.ts](../../src/hooks/use-keyboard-shortcuts.ts) — shortcuts
- [split-pane-container.tsx](../../src/components/split-pane-container.tsx) — pane split UI

## Overview
- **Priority**: Medium
- **Status**: Pending
- **Depends on**: Phase 1-4

## Requirements

### Functional
- Pane type selector: when splitting, show dropdown/popover to pick "Terminal" or "Claude"
- Right-click context menu on pane header for type selection
- Keyboard shortcut to split with Claude pane (e.g., Ctrl+Shift+C)
- Claude pane state cleanup on close (kill process, remove store state)
- Session persistence — remember which panes are Claude type across restarts

### Non-Functional
- Minimal UI for type selection — no modal, just inline popover
- Consistent with existing split UX

## Architecture

### Pane Type Selector
Small popover on the split button (or right-click context menu):
```
┌──────────────┐
│ ▸ Terminal    │
│ ▸ Claude     │
└──────────────┘
```

### Cleanup Flow
```
User closes Claude pane
  → PaneStore.closePane() called
  → ClaudeStore.removePaneState(paneId) — clears messages
  → claude_cancel Tauri command — kills any running process
```

### Session Persistence
- Extend session_store to save pane types in tree serialization
- On restore, recreate Claude panes (but don't restore messages — start fresh)

## Related Code Files
- **Modify**: `src/components/split-pane-container.tsx` — add split type selector
- **Modify**: `src/stores/pane-store.ts` — cleanup hook for Claude panes
- **Modify**: `src/hooks/use-keyboard-shortcuts.ts` — add Claude split shortcut
- **Modify**: `src-tauri/src/session_store.rs` — persist pane types (if needed)

## Implementation Steps
1. Add pane type selector UI to split button area
2. Wire selector to `split(path, id, dir, paneType)` call
3. Add cleanup in closePane: call ClaudeStore.removePaneState + claude_cancel
4. Add keyboard shortcut Ctrl+Shift+C for Claude split
5. Update session serialization to include paneType field
6. Test full flow: create Claude pane → chat → close → no leaks

## Todo
- [ ] Add pane type selector popover/dropdown
- [ ] Wire split with pane type
- [ ] Add cleanup on pane close
- [ ] Add keyboard shortcut for Claude split
- [ ] Update session persistence for pane types
- [ ] End-to-end testing

## Success Criteria
- User can split and choose between Terminal/Claude
- Closing Claude pane cleans up all state and processes
- Pane types persist across app restarts
- Keyboard shortcut works

## Risk Assessment
- **Low**: Integration work, all building blocks in place from prior phases
