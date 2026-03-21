# Phase 4: Chat UI Components

## Context
- [terminal-pane.tsx](../../src/components/terminal-pane.tsx) — existing pane component pattern
- [markdown-preview.tsx](../../src/components/markdown-preview.tsx) — reusable markdown renderer
- [split-pane-container.tsx](../../src/components/split-pane-container.tsx) — portal-based rendering
- Research: Virtuoso for scrolling, auto-scroll with followOutput, memoized messages

## Overview
- **Priority**: High
- **Status**: Pending
- **Depends on**: Phase 1 (pane types), Phase 3 (claude store)

## Key Insights
- Reuse existing `markdown-preview.tsx` for message content rendering
- Virtuoso handles auto-scroll and virtualization (critical for long conversations)
- Keep components small (<200 lines) — split into message list, message item, input
- Match Catppuccin theme — user messages vs assistant messages with subtle bg difference

## Requirements

### Functional
- Message list with user/assistant messages
- Streaming text display (chunks append in real-time)
- Chat input with Shift+Enter for newlines, Enter to send
- Tool use blocks shown inline (file edits, bash commands)
- Cancel button during streaming
- "Claude not installed" fallback UI
- Auto-scroll to bottom on new messages (unless user scrolled up)

### Non-Functional
- Memoized message components (no re-render on sibling updates)
- Under 200 lines per component file
- Consistent with Catppuccin Mocha theme

## Architecture

### Component Tree
```
ClaudeChatPane (container — listens to Tauri events)
├── ClaudeMessageList (Virtuoso-based scrollable list)
│   ├── ClaudeMessageItem (user message)
│   ├── ClaudeMessageItem (assistant message)
│   │   ├── MarkdownPreview (reused)
│   │   └── ToolUseBlock (inline action display)
│   └── StreamingIndicator (dots while waiting)
└── ClaudeInput (textarea + send button)
```

### ClaudeChatPane (~120 lines)
- Container component, manages Tauri event listeners
- Listens to `claude-stream` and `claude-complete` events
- Dispatches to claude store's handleStreamLine/handleComplete
- Checks claude CLI installation on mount
- Renders ClaudeMessageList + ClaudeInput

### ClaudeMessageList (~80 lines)
- Uses Virtuoso with `followOutput="smooth"` for auto-scroll
- Maps messages from claude store
- Renders ClaudeMessageItem per message
- Shows streaming indicator when status === "streaming"

### ClaudeMessageItem (~100 lines, memo)
- Different bg for user vs assistant: `bg-ctp-surface0` vs transparent
- User: simple text display
- Assistant: MarkdownPreview for content + ToolUseBlock for tool calls
- Timestamp display

### ClaudeInput (~80 lines)
- Textarea with auto-resize (react-textarea-autosize)
- Enter to send, Shift+Enter for newline
- Disabled during streaming
- Cancel button shown during streaming
- Placeholder: "Ask Claude..."

### ToolUseBlock (~60 lines)
- Collapsible block showing tool name + input/output
- Icons per tool type (file, terminal, search)
- Styled as subtle card within message

## Related Code Files
- **Create**: `src/components/claude-chat-pane.tsx` — main container
- **Create**: `src/components/claude-message-list.tsx` — virtualized message list
- **Create**: `src/components/claude-message-item.tsx` — single message renderer
- **Create**: `src/components/claude-input.tsx` — chat input area
- **Reuse**: `src/components/markdown-preview.tsx` — markdown rendering
- **Modify**: `src/components/split-pane-container.tsx` — import and render ClaudeChatPane

## Implementation Steps
1. Install `react-textarea-autosize` and `react-virtuoso`
2. Create `claude-input.tsx`: textarea + send/cancel buttons
3. Create `claude-message-item.tsx`: memo'd message with markdown + tool use
4. Create `claude-message-list.tsx`: Virtuoso wrapper with auto-scroll
5. Create `claude-chat-pane.tsx`: event listeners, store connection, layout
6. Update `split-pane-container.tsx`: import ClaudeChatPane, render by paneType
7. Style with Catppuccin classes matching existing UI

## Todo
- [ ] Install react-textarea-autosize and react-virtuoso
- [ ] Create claude-input.tsx
- [ ] Create claude-message-item.tsx with markdown rendering
- [ ] Create claude-message-list.tsx with Virtuoso
- [ ] Create claude-chat-pane.tsx with Tauri event listeners
- [ ] Update split-pane-container.tsx to render Claude panes
- [ ] Style consistently with Catppuccin theme

## Success Criteria
- User can type message and see streaming response
- Markdown renders correctly (code blocks, lists, headers)
- Auto-scrolls during streaming, stops if user scrolls up
- Cancel stops the current request
- Tool use blocks display inline

## Risk Assessment
- **Low**: Component patterns well-established in codebase
- **Medium**: Streaming markdown may flash during partial updates — use simple append strategy first, upgrade to Streamdown if needed
