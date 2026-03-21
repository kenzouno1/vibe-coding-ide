# Phase 5: Input UX Polish

## Context
- [claude-input.tsx](../../src/components/claude-input.tsx) — current simple textarea
- [Chat UI research](../../plans/reports/researcher-260321-0850-chat-ui-best-practices.md)

## Overview
- **Priority:** Low
- **Status:** Pending
- Polish input experience: message history navigation, context hints, keyboard shortcuts

## Requirements

### Functional
- Up arrow in empty input cycles through previous user messages (like terminal history)
- Ctrl+L clears conversation (maps to `/clear`)
- Input shows context hint: "Shift+Enter for newline" (subtle, disappears on first use)
- Character count / approximate token count for long messages
- Ctrl+Enter as alternative send shortcut

### Non-functional
- History stored per-pane in memory (not persisted)
- Max 50 history entries

## Related Code Files

### Modify
- `src/components/claude-input.tsx` — History navigation, keyboard shortcuts, hints

## Implementation Steps

1. **Message history navigation**
   - Track `inputHistory: string[]` in ref (not state — no re-renders)
   - Track `historyIndex: number` in ref
   - Up arrow when cursor at line 1: go back in history
   - Down arrow: go forward in history
   - On send: push to history, reset index

2. **Keyboard shortcuts**
   - Ctrl+L → clear conversation
   - Ctrl+Enter → send (alternative to Enter)
   - Tab when dropdown open → select first match

3. **Context hints**
   - Show "Shift+Enter for newline · / for commands" below textarea
   - Fade out after first interaction
   - Use `text-ctp-overlay0 text-[10px]`

## Todo List
- [ ] Add input history with up/down navigation
- [ ] Add Ctrl+L clear shortcut
- [ ] Add Ctrl+Enter send shortcut
- [ ] Add context hint text
- [ ] Test keyboard interactions

## Success Criteria
- Up arrow recalls previous messages
- Ctrl+L clears conversation
- Hints visible but unobtrusive
