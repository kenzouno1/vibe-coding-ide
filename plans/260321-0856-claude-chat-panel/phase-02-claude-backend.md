# Phase 2: Claude Backend (Rust)

## Context
- [pty_manager.rs](../../src-tauri/src/pty_manager.rs) — existing PTY spawn/stream pattern
- [lib.rs](../../src-tauri/src/lib.rs) — Tauri command registration
- Research: Claude CLI uses `-p --output-format stream-json --verbose` for NDJSON streaming

## Overview
- **Priority**: High (backend foundation for chat)
- **Status**: Pending
- **Depends on**: None (parallel with Phase 1)

## Key Insights
- Claude CLI: `claude -p "<msg>" --output-format stream-json --verbose --cwd <dir>`
- Add `--resume <session-id>` for conversation continuity
- Add `--allowedTools` to prevent permission prompts in non-interactive mode
- Output is NDJSON — one JSON object per line
- Session ID available in final `result` event for resumption

## Requirements

### Functional
- Spawn claude CLI process per chat session
- Stream NDJSON output as Tauri events to frontend
- Support conversation resumption via session ID
- Kill running claude process on user cancel/pane close
- Detect if `claude` CLI is installed

### Non-Functional
- UTF-8 safe line buffering (reuse pattern from pty_manager.rs)
- Process cleanup on app shutdown
- No blocking — async process management

## Architecture

### Data Flow
```
User types message in chat UI
  → Frontend calls Tauri command `claude_send_message`
  → Rust spawns: claude -p "msg" --output-format stream-json --verbose --cwd <dir>
  → Reader thread reads stdout line-by-line
  → Each line emitted as Tauri event `claude-stream`
  → Frontend parses JSON, updates chat store
  → On process exit, emit `claude-complete` event
```

### Tauri Events
```rust
// Streamed to frontend per NDJSON line
#[derive(Serialize)]
struct ClaudeStreamEvent {
    session_id: String,  // our internal session ID (not Claude's)
    line: String,        // raw JSON line from claude CLI
}

// Emitted when process exits
#[derive(Serialize)]
struct ClaudeCompleteEvent {
    session_id: String,
    exit_code: Option<i32>,
}
```

### Tauri Commands
```rust
// Start a new chat or continue existing
#[tauri::command]
fn claude_send_message(
    state: State<ClaudeState>,
    app: AppHandle,
    session_id: String,        // our pane-level session ID
    message: String,
    cwd: String,
    resume_session: Option<String>,  // Claude's session ID for --resume
) -> Result<(), String>

// Cancel running request
#[tauri::command]
fn claude_cancel(state: State<ClaudeState>, session_id: String) -> Result<(), String>

// Check if claude CLI is available
#[tauri::command]
fn claude_check_installed() -> Result<bool, String>
```

### State Management
```rust
struct ClaudeSession {
    child: std::process::Child,  // running process
}

struct ClaudeState {
    sessions: Arc<Mutex<HashMap<String, ClaudeSession>>>,
}
```

## Related Code Files
- **Create**: `src-tauri/src/claude_manager.rs` — process spawn, streaming, state
- **Modify**: `src-tauri/src/lib.rs` — register commands, manage ClaudeState

## Implementation Steps
1. Create `claude_manager.rs` with `ClaudeState` struct
2. Implement `claude_check_installed()` — run `claude --version` and check exit code
3. Implement `claude_send_message()`:
   - Build command args: `-p`, `--output-format`, `stream-json`, `--verbose`, `--cwd`
   - Add `--resume <id>` if resume_session provided
   - Spawn process with `stdout(Stdio::piped())`
   - Store child in sessions map
   - Spawn reader thread: `BufReader::new(stdout).lines()` → emit `claude-stream` events
   - On process exit: emit `claude-complete`, remove from sessions
4. Implement `claude_cancel()` — kill child process
5. Register commands and state in `lib.rs`
6. Add cleanup on app shutdown (kill all claude processes)

## Todo
- [ ] Create claude_manager.rs with ClaudeState
- [ ] Implement claude_check_installed command
- [ ] Implement claude_send_message with process spawn + streaming
- [ ] Implement claude_cancel
- [ ] Register in lib.rs
- [ ] Add process cleanup on drop

## Success Criteria
- `claude_check_installed` returns true when claude CLI is on PATH
- `claude_send_message` spawns process, streams NDJSON lines as events
- `claude_cancel` kills the running process
- No zombie processes after pane close

## Risk Assessment
- **Medium**: Claude CLI must be installed — show friendly error if not
- **Low**: Process management is straightforward with `std::process::Command`
- Edge case: claude CLI may prompt for auth — detect and surface to user
