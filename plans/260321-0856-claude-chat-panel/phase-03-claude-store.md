# Phase 3: Claude Store (Frontend State)

## Context
- [pane-store.ts](../../src/stores/pane-store.ts) — per-project state pattern with `Record<string, T>`
- [git-store.ts](../../src/stores/git-store.ts) — example of Zustand store with per-project state
- Research: NDJSON events: `system`, `stream_event` (content_block_delta), `assistant`, `result`

## Overview
- **Priority**: High
- **Status**: Pending
- **Depends on**: Phase 2 (backend events define data shape)

## Key Insights
- Each Claude pane has its own chat session (messages, streaming state)
- State keyed by paneId (not projectPath, since multiple Claude panes possible per project)
- NDJSON parsing happens here — raw JSON lines from backend → typed message objects
- Session ID from `result` event enables conversation resumption

## Requirements

### Functional
- Store chat messages per pane: user messages + assistant responses
- Parse NDJSON stream events into message state
- Track streaming state: idle | streaming | error
- Store Claude session ID for `--resume` support
- Support message cancellation

### Non-Functional
- Selective re-renders via Zustand selectors
- Messages append-only during streaming (no full-array replacement)

## Architecture

### Types
```typescript
type MessageRole = "user" | "assistant";
type StreamStatus = "idle" | "streaming" | "error";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;        // accumulated text
  timestamp: number;
  toolUse?: ToolUseBlock[];  // file edits, commands, etc.
  costUsd?: number;
}

interface ToolUseBlock {
  name: string;           // "Write", "Bash", "Read", etc.
  input: string;          // tool input summary
  result?: string;        // tool result summary
}

interface ClaudePaneState {
  messages: ChatMessage[];
  status: StreamStatus;
  claudeSessionId: string | null;  // for --resume
  error: string | null;
}
```

### Store Interface
```typescript
interface ClaudeStore {
  states: Record<string, ClaudePaneState>;  // keyed by paneId

  getState: (paneId: string) => ClaudePaneState;
  sendMessage: (paneId: string, projectPath: string, message: string) => Promise<void>;
  cancelMessage: (paneId: string) => Promise<void>;
  handleStreamLine: (paneId: string, jsonLine: string) => void;
  handleComplete: (paneId: string) => void;
  removePaneState: (paneId: string) => void;
}
```

### NDJSON Parsing Logic
```typescript
handleStreamLine(paneId, line) {
  const event = JSON.parse(line);
  switch (event.type) {
    case "assistant":
      // Full assistant message — create/update message entry
      break;
    case "stream_event":
      // content_block_delta → append text chunk to current message
      if (event.event?.delta?.text) {
        appendToCurrentMessage(paneId, event.event.delta.text);
      }
      // input_json_delta → tool use streaming
      break;
    case "result":
      // Final result — extract session_id, cost
      setClaudeSessionId(paneId, event.session_id);
      break;
    case "system":
      // System info — ignore or log
      break;
  }
}
```

## Related Code Files
- **Create**: `src/stores/claude-store.ts`
- **Modify**: (none — listeners set up in Phase 4 components)

## Implementation Steps
1. Define types: ChatMessage, ToolUseBlock, ClaudePaneState, StreamStatus
2. Create Zustand store with `Record<paneId, ClaudePaneState>` pattern
3. Implement `getState()` with lazy init (empty messages, idle status)
4. Implement `sendMessage()`: add user message, invoke `claude_send_message` Tauri command, set status to streaming
5. Implement `handleStreamLine()`: parse NDJSON, dispatch by event.type
6. Implement `handleComplete()`: set status to idle, extract session ID
7. Implement `cancelMessage()`: invoke `claude_cancel`, set status to idle
8. Implement `removePaneState()`: cleanup on pane close

## Todo
- [ ] Define ChatMessage and related types
- [ ] Create claude-store.ts with Zustand
- [ ] Implement getState with lazy init
- [ ] Implement sendMessage (Tauri invoke + user message)
- [ ] Implement handleStreamLine (NDJSON parser)
- [ ] Implement handleComplete
- [ ] Implement cancelMessage
- [ ] Implement removePaneState

## Success Criteria
- Sending a message adds user message and starts streaming
- Stream events parsed correctly into assistant message content
- Session ID captured from result event
- Status transitions: idle → streaming → idle (or error)

## Risk Assessment
- **Low**: Straightforward Zustand store following existing patterns
- Edge case: malformed JSON lines from claude CLI — wrap parse in try/catch
