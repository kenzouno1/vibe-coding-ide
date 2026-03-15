---
phase: 4
title: "AI Agent CLI Integration via WebSocket"
status: pending
effort: 3.5h
depends_on: [1]
---

# Phase 4: AI Agent CLI Integration

## Context Links
- [ssh_manager.rs](../../src-tauri/src/ssh_manager.rs) — SSH session state
- [lib.rs](../../src-tauri/src/lib.rs) — Tauri setup/startup
- Phase 1 provides: multi-channel backend, channel_id routing

## Overview
Expose SSH sessions to external AI agents via a local WebSocket server bound to `127.0.0.1:9876`. Agents (Claude Code, Cursor, etc.) connect via WS, authenticate with a per-launch token, and can list sessions, send commands, read output, and execute with timeout.

## Key Design Decisions

**Why WebSocket over alternatives:**
| Option | Pros | Cons |
|--------|------|------|
| Named pipes | Fast, no port | Platform-specific, complex client code |
| HTTP REST | Simple client | Polling for output, no streaming |
| **WebSocket** | **Streaming output, cross-platform, any WS client** | **Port management** |

**Security model:**
- Bind to `127.0.0.1` only (no external access)
- Generate random auth token at app startup, write to `~/.devtools/agent-token`
- Agents read token from file, send as first message or header
- Token rotates each app launch

**Architecture:**
```
External Agent (Claude Code, etc.)
  │ ws://127.0.0.1:9876
  ▼
AgentWsServer (new Rust module)
  │ Validates token
  │ JSON-RPC style messages
  ▼
SshState (existing, shared via Arc)
  │ ssh_write, ssh_open_channel, etc.
  ▼
SSH Session → Remote VPS
```

## Related Code Files

### Create
- `src-tauri/src/agent_server.rs` — WebSocket server module
- `src-tauri/src/agent_protocol.rs` — message types and handlers

### Modify
- `src-tauri/src/lib.rs` — start agent server on app startup, share SshState
- `src-tauri/src/ssh_manager.rs` — make `SshState.sessions` accessible (add pub getter or pass Arc directly)

### Frontend (minimal)
- `src/stores/ssh-store.ts` — add agent server status indicator (optional, low priority)

## Protocol Design

### Authentication
```json
// Client → Server (first message)
{ "type": "auth", "token": "abc123..." }

// Server → Client
{ "type": "auth_ok" }
// or
{ "type": "error", "message": "invalid token" }
```

### Commands (after auth)

**List sessions:**
```json
// Request
{ "type": "list_sessions", "id": 1 }
// Response
{
  "type": "result", "id": 1,
  "data": [
    { "session_id": "uuid", "host": "10.0.0.1", "username": "root", "channels": ["default", "ch-uuid"] }
  ]
}
```

**Write to channel:**
```json
{ "type": "write", "id": 2, "session_id": "uuid", "channel_id": "default", "data": "ls -la\n" }
// Response
{ "type": "result", "id": 2, "data": "ok" }
```

**Subscribe to output (streaming):**
```json
{ "type": "subscribe", "id": 3, "session_id": "uuid", "channel_id": "default" }
// Server streams output as it arrives:
{ "type": "output", "session_id": "uuid", "channel_id": "default", "data": "total 42\n..." }
```

**Execute command (write + wait for prompt):**
```json
{
  "type": "execute", "id": 4,
  "session_id": "uuid", "channel_id": "default",
  "command": "apt update",
  "timeout_ms": 30000,
  "prompt_pattern": "\\$\\s*$"  // regex to detect command completion
}
// Server sends output chunks as they arrive:
{ "type": "output", "session_id": "uuid", "channel_id": "default", "data": "Hit:1 http://..." }
// Final response when prompt detected or timeout:
{ "type": "result", "id": 4, "data": { "output": "full output...", "timed_out": false } }
```

**Open new channel:**
```json
{ "type": "open_channel", "id": 5, "session_id": "uuid" }
{ "type": "result", "id": 5, "data": { "channel_id": "new-uuid" } }
```

**Resize channel:**
```json
{ "type": "resize", "id": 6, "session_id": "uuid", "channel_id": "default", "rows": 40, "cols": 120 }
{ "type": "result", "id": 6, "data": "ok" }
```

**Unsubscribe:**
```json
{ "type": "unsubscribe", "id": 7, "session_id": "uuid", "channel_id": "default" }
```

## Implementation Steps

### 1. Create agent_protocol.rs (~80 lines)
Define serde types for all messages:
```rust
#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum AgentRequest {
    #[serde(rename = "auth")]
    Auth { token: String },
    #[serde(rename = "list_sessions")]
    ListSessions { id: u64 },
    #[serde(rename = "write")]
    Write { id: u64, session_id: String, channel_id: String, data: String },
    #[serde(rename = "subscribe")]
    Subscribe { id: u64, session_id: String, channel_id: String },
    #[serde(rename = "unsubscribe")]
    Unsubscribe { id: u64, session_id: String, channel_id: String },
    #[serde(rename = "execute")]
    Execute { id: u64, session_id: String, channel_id: String, command: String, timeout_ms: u64, prompt_pattern: Option<String> },
    #[serde(rename = "open_channel")]
    OpenChannel { id: u64, session_id: String },
    #[serde(rename = "resize")]
    Resize { id: u64, session_id: String, channel_id: String, rows: u16, cols: u16 },
}

#[derive(Serialize)]
#[serde(tag = "type")]
pub enum AgentResponse {
    #[serde(rename = "auth_ok")]
    AuthOk,
    #[serde(rename = "result")]
    Result { id: u64, data: serde_json::Value },
    #[serde(rename = "output")]
    Output { session_id: String, channel_id: String, data: String },
    #[serde(rename = "error")]
    Error { id: Option<u64>, message: String },
}
```

### 2. Create agent_server.rs (~150 lines)
Use `tokio-tungstenite` for WS server:

```rust
pub struct AgentServer {
    token: String,
    ssh_state: Arc<Mutex<HashMap<String, SshSession>>>,
    // Output broadcast: agents subscribe to (session_id, channel_id) pairs
    output_tx: broadcast::Sender<(String, String, String)>, // (session_id, channel_id, data)
}

impl AgentServer {
    pub fn new(ssh_sessions: Arc<...>, output_tx: broadcast::Sender<...>) -> Self { ... }

    pub async fn start(self, addr: &str) -> Result<(), Box<dyn Error>> {
        let listener = TcpListener::bind(addr).await?;
        // Accept connections, spawn handler per client
    }

    async fn handle_client(self: Arc<Self>, ws_stream: WebSocketStream) {
        // 1. Wait for auth message, validate token
        // 2. Loop: receive requests, dispatch to handlers
        // 3. For subscriptions: spawn task that forwards from broadcast receiver
    }
}
```

### 3. Output broadcast integration
In `ssh_manager.rs`, add a `broadcast::Sender` to `SshState`:
```rust
pub struct SshState {
    sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    pub output_tx: broadcast::Sender<(String, String, String)>, // NEW
}
```

In `SshClientHandler::data()`, after emitting Tauri event, also send to broadcast:
```rust
let _ = self.output_tx.send((
    self.session_id.clone(),
    channel_label.clone(),
    text.clone(),
));
```

This allows AgentServer to forward output to subscribed WS clients without touching the Tauri event system.

### 4. Token generation and file writing
In `lib.rs` setup:
```rust
// Generate token
let token = uuid::Uuid::new_v4().to_string();

// Write to ~/.devtools/agent-token
let token_path = dirs::home_dir().unwrap().join(".devtools").join("agent-token");
std::fs::create_dir_all(token_path.parent().unwrap())?;
std::fs::write(&token_path, &token)?;

// Set restrictive permissions (Unix only)
#[cfg(unix)]
std::fs::set_permissions(&token_path, std::fs::Permissions::from_mode(0o600))?;
```

### 5. Start server in lib.rs setup
```rust
.setup(|app| {
    // ... existing setup

    let ssh_state: &SshState = app.state::<SshState>().inner();
    let sessions_arc = ssh_state.sessions.clone();
    let output_tx = ssh_state.output_tx.clone();

    let server = AgentServer::new(sessions_arc, output_tx, token);
    tokio::spawn(async move {
        if let Err(e) = server.start("127.0.0.1:9876").await {
            log::error!("Agent server failed: {e}");
        }
    });

    Ok(())
})
```

### 6. Add dependencies to Cargo.toml
```toml
tokio-tungstenite = "0.24"
# tokio, serde_json already present
```

### 7. Execute command handler (the complex one)
```rust
async fn handle_execute(
    &self,
    session_id: &str,
    channel_id: &str,
    command: &str,
    timeout_ms: u64,
    prompt_pattern: Option<&str>,
) -> Result<(String, bool), String> {
    // 1. Subscribe to output broadcast for this session+channel
    // 2. Write command + "\n" to channel
    // 3. Collect output until prompt_pattern matches or timeout
    // 4. Return (collected_output, timed_out)
    // Default prompt_pattern: r"[\$#>]\s*$"
}
```

### 8. Expose SshState internals for agent server
Add a method to SshState for listing sessions (host/user info isn't stored currently):
```rust
// Option A: Store metadata in SshSession
struct SshSession {
    handle: client::Handle<SshClientHandler>,
    channels: HashMap<String, Arc<Channel<client::Msg>>>,
    channel_labels: Arc<TokioMutex<HashMap<ChannelId, String>>>,
    // NEW metadata for agent API
    host: String,
    username: String,
}
```

Add to `ssh_connect`: store `host` and `username` in session.

Add public method:
```rust
pub async fn list_sessions_info(&self) -> Vec<SessionInfo> {
    let sessions = self.sessions.lock().await;
    sessions.iter().map(|(id, s)| SessionInfo {
        session_id: id.clone(),
        host: s.host.clone(),
        username: s.username.clone(),
        channels: s.channels.keys().cloned().collect(),
    }).collect()
}
```

## Todo List
- [ ] Add `tokio-tungstenite` to Cargo.toml
- [ ] Create agent_protocol.rs with request/response types
- [ ] Add broadcast channel to SshState
- [ ] Emit to broadcast in SshClientHandler::data/extended_data
- [ ] Store host/username metadata in SshSession
- [ ] Add list_sessions_info method to SshState
- [ ] Create agent_server.rs with WS server
- [ ] Implement auth handler
- [ ] Implement list_sessions handler
- [ ] Implement write handler
- [ ] Implement subscribe/unsubscribe with broadcast forwarding
- [ ] Implement execute handler with timeout + prompt detection
- [ ] Implement open_channel/resize handlers
- [ ] Token generation + file write in lib.rs setup
- [ ] Start server in lib.rs setup
- [ ] Compile check + test with `wscat`

## Success Criteria
- Agent server starts on `127.0.0.1:9876` at app launch
- Token written to `~/.devtools/agent-token`
- External WS client can authenticate, list sessions, write commands, read output
- `execute` waits for prompt pattern and returns full output
- Subscribe streams output in real-time
- Invalid token rejected
- Server doesn't crash when SSH session disconnects mid-subscription

## Risk Assessment
- **Port conflict** — 9876 might be in use. Mitigation: try port, fall back to 9877-9880, write actual port to token file alongside token. Or use `port: 0` for OS-assigned port.
- **Output buffering** — broadcast channel might drop messages if agent is slow. Use reasonable buffer size (1000 messages). Agent can request output history if needed (future enhancement).
- **Prompt detection** — regex on partial output may miss multi-line prompts. Mitigation: accumulate buffer, apply regex after each chunk. Default pattern covers `$`, `#`, `>` prompts.
- **Concurrent agents** — multiple agents subscribing to same channel is fine (broadcast). Multiple agents writing to same channel could interleave. Document: one writer per channel recommended.

## Security Considerations
- **Localhost only** — bind to 127.0.0.1, never 0.0.0.0
- **Token auth** — per-launch UUID token, not guessable
- **File permissions** — token file readable only by current user (0600 on Unix, ACL on Windows)
- **No session creation** — agents can't create new SSH connections (only interact with existing ones opened by user in UI). This prevents agents from connecting to arbitrary hosts.
- **Rate limiting** — optional, not in v1. Add if abuse detected.

## Unresolved Questions
- Should agents be able to create new SSH connections (not just use existing)? Current design: no, user must open from UI. Could add later with explicit user approval dialog.
- Should the port/token be configurable via settings? For v1: hardcoded port with fallback is sufficient.
