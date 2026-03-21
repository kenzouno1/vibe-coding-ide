# Phase 3: Enhanced Streaming & Event Parsing

## Context
- [CLI stream-json format](../../plans/reports/researcher-260321-claude-cli-subprocess-research.md)
- [Current handleStreamLine](../../src/stores/claude-store.ts) — only handles `content_block_delta`, `assistant`, `result`
- [claude_manager.rs](../../src-tauri/src/claude_manager.rs)

## Overview
- **Priority:** Medium
- **Status:** Pending
- Parse full range of stream events for richer UI: thinking indicator, tool use progress, model info, token usage

## Key Insights
- Current implementation skips most event types (system, stream_event, rate_limit)
- Adding `--include-partial-messages` flag enables token-by-token streaming via `stream_event` wrapper
- Tool use blocks can be tracked with `content_block_start`/`content_block_stop` events
- `system` init event contains model name, session_id, available tools

## Requirements

### Functional
- Show model name in header (from `system.init` event)
- Show thinking/processing indicator during tool execution
- Show tool use blocks with live status (pending → running → complete)
- Display token usage and cost after each response
- Show rate limit warnings when approaching limits

### Non-functional
- No regression in streaming text performance
- State updates batched to avoid excessive re-renders

## Architecture

### Stream Event Flow (with `--include-partial-messages`)

```
system.init → Extract model, session_id, tools list
  ↓
stream_event(message_start) → Mark message as streaming
  ↓
stream_event(content_block_start, type=text) → Prepare text block
stream_event(content_block_delta, text_delta) → Append text tokens
stream_event(content_block_stop) → Mark text block complete
  ↓
stream_event(content_block_start, type=tool_use) → Show tool pending
stream_event(content_block_delta, input_json_delta) → Accumulate tool input
stream_event(content_block_stop) → Mark tool input complete
  ↓
assistant → Full message with all blocks (reconcile)
  ↓
user (tool_result) → Show tool result
  ↓
result → Session complete, extract cost/usage/session_id
```

## Related Code Files

### Modify
- `src/stores/claude-store.ts` — Enhanced `handleStreamLine` parser, new state fields
- `src/components/claude-message-item.tsx` — Tool use status UI, cost/usage display
- `src/components/claude-chat-pane.tsx` — Model name in header
- `src-tauri/src/claude_manager.rs` — Add `--include-partial-messages` flag

### Create
- `src/components/claude-tool-block.tsx` — Rich tool use visualization component

## Implementation Steps

1. **Backend: add streaming flag** (`claude_manager.rs`)
   - Add `--include-partial-messages` to Command args
   - This enables `stream_event` wrappers around Claude API events

2. **Store: enhanced event parsing** (`claude-store.ts`)
   - Add to `ClaudePaneState`:
     - `modelName: string | null`
     - `availableTools: string[]`
     - `tokenUsage: { input: number, output: number, cacheRead: number, cacheWrite: number } | null`
   - Parse `system` events:
     - `subtype: "init"` → extract `model`, `session_id`, `tools`
   - Parse `stream_event` events:
     - `content_block_start` with `tool_use` type → add pending tool block
     - `input_json_delta` → accumulate tool input JSON
     - `content_block_stop` → mark tool block input complete
   - Parse `user` events (tool results):
     - Match tool result to pending tool block
     - Store result text
   - Parse `result` event:
     - Extract `usage` object for token counts

3. **Update ToolUseBlock interface**
   ```typescript
   interface ToolUseBlock {
     id: string;
     name: string;
     input: string;
     result?: string;
     status: "pending" | "running" | "complete" | "error";
   }
   ```

4. **Tool block component** (`claude-tool-block.tsx`)
   - Pending: spinner + tool name
   - Running: spinner + tool name + partial input preview
   - Complete: checkmark + tool name + collapsible input/result
   - Error: X icon + error message

5. **UI updates**
   - Header: show model name badge
   - Message footer: token usage + cost
   - Rate limit: subtle warning banner

## Todo List
- [ ] Add `--include-partial-messages` flag in Rust
- [ ] Parse `system.init` events in store
- [ ] Parse `stream_event` wrapper events
- [ ] Parse `user` (tool result) events
- [ ] Update ToolUseBlock with status tracking
- [ ] Create tool block component
- [ ] Show model name in header
- [ ] Show token usage in message footer

## Success Criteria
- Model name displayed in panel header
- Tool use shows live status progression
- Token usage visible after each response
- No regression in text streaming speed
- Rate limit events surface as warnings

## Risk Assessment
- **Low risk:** Additive parsing, fallback to current behavior for unknown events
- **Performance:** `stream_event` fires per token — ensure state updates batched
- **Compatibility:** Older Claude CLI versions may not emit all events — handle gracefully
