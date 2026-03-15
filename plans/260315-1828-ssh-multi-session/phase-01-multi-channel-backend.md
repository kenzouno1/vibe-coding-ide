---
phase: 1
title: "Multi-Channel SSH Backend"
status: pending
effort: 2h
---

# Phase 1: Multi-Channel SSH Backend

## Context Links
- [ssh_manager.rs](../../src-tauri/src/ssh_manager.rs) — current single-channel session
- [lib.rs](../../src-tauri/src/lib.rs) — command registration

## Overview
Refactor `SshState` to support multiple channels per SSH session. Each channel = independent PTY shell. This enables split panes (Phase 3) where each pane has its own shell on the same SSH connection.

## Key Insights
- `russh` supports `channel_open_session()` multiple times on same `client::Handle`
- Current `SshSession` stores single `channel: Arc<Channel>` — must become `HashMap<String, Arc<Channel>>`
- Event payload must include `channel_id` so frontend routes output to correct pane
- Backward compat: `ssh_connect` still returns `session_id` and opens one default channel

## Architecture

```
SshSession (refactored):
  handle: client::Handle<SshClientHandler>
  channels: HashMap<String, Arc<Channel<client::Msg>>>

SshClientHandler (refactored):
  session_id: String
  channel_labels: Arc<Mutex<HashMap<ChannelId, String>>>
  // Maps russh ChannelId → our string channel_id for event routing

SshOutput (refactored):
  id: String          // session_id
  channel_id: String  // NEW — which channel produced this output
  data: String
```

## Related Code Files

### Modify
- `src-tauri/src/ssh_manager.rs` — all changes below

### No changes
- `src-tauri/src/sftp_ops.rs` — uses per-request SFTP sessions, unaffected
- `src-tauri/src/ssh_presets.rs` — unaffected

## Implementation Steps

### 1. Update SshOutput struct
```rust
// Add channel_id field
pub struct SshOutput {
    pub id: String,
    pub channel_id: String,  // NEW
    pub data: String,
}
```

### 2. Refactor SshClientHandler for channel routing
```rust
struct SshClientHandler {
    app: AppHandle,
    session_id: String,
    // Map russh's internal ChannelId → our string label
    channel_labels: Arc<TokioMutex<HashMap<ChannelId, String>>>,
}
```
- In `data()` and `extended_data()`: look up `channel_labels[channel]` to get the string channel_id, include in event payload
- Fallback to `"default"` if channel not found

### 3. Refactor SshSession struct
```rust
struct SshSession {
    handle: client::Handle<SshClientHandler>,
    channels: HashMap<String, Arc<Channel<client::Msg>>>,
    channel_labels: Arc<TokioMutex<HashMap<ChannelId, String>>>,
}
```

### 4. Update ssh_connect — open default channel
- After auth, open channel as before but store as `channels["default"]`
- Register in `channel_labels`: `russh_channel_id → "default"`
- Return session_id (unchanged API)

### 5. Add ssh_open_channel command (NEW)
```rust
#[tauri::command]
pub async fn ssh_open_channel(
    state: tauri::State<'_, SshState>,
    session_id: String,
) -> Result<String, String>
```
- Generate channel_id = uuid
- Call `handle.channel_open_session()`, request PTY + shell
- Store in `session.channels[channel_id]`
- Register in `channel_labels`
- Return channel_id

### 6. Add ssh_close_channel command (NEW)
```rust
#[tauri::command]
pub async fn ssh_close_channel(
    state: tauri::State<'_, SshState>,
    session_id: String,
    channel_id: String,
) -> Result<(), String>
```
- Remove from `session.channels` and `channel_labels`
- Send EOF on channel
- Don't close the session itself

### 7. Update ssh_write — accept channel_id parameter
```rust
pub async fn ssh_write(
    state: tauri::State<'_, SshState>,
    id: String,           // session_id
    channel_id: String,   // NEW — defaults to "default" on frontend
    data: String,
) -> Result<(), String>
```
- Look up `session.channels[channel_id]`

### 8. Update ssh_resize — accept channel_id parameter
Same pattern as ssh_write — add `channel_id` param, look up correct channel.

### 9. Update ssh_disconnect — close all channels
- Iterate `session.channels`, close each
- Remove session from map (existing behavior)

### 10. Register new commands in lib.rs
Add `ssh_open_channel` and `ssh_close_channel` to `generate_handler![]`

## Todo List
- [ ] Update SshOutput with channel_id
- [ ] Refactor SshClientHandler with channel_labels map
- [ ] Refactor SshSession to channels HashMap
- [ ] Update ssh_connect for default channel
- [ ] Implement ssh_open_channel
- [ ] Implement ssh_close_channel
- [ ] Update ssh_write with channel_id param
- [ ] Update ssh_resize with channel_id param
- [ ] Update ssh_disconnect to close all channels
- [ ] Register commands in lib.rs
- [ ] Compile check: `cargo build`

## Success Criteria
- `ssh_connect` works as before (returns session_id, opens default channel)
- `ssh_open_channel(session_id)` returns new channel_id, output routed correctly
- `ssh_write/ssh_resize` target specific channel
- `ssh_close_channel` closes one channel without killing session
- `ssh_disconnect` cleans up everything
- Existing frontend still works (passes `"default"` as channel_id)

## Risk Assessment
- **russh channel limit** — SSH servers may limit channels. Typical limit is 10+, sufficient for split panes.
- **Channel routing race** — Channel label must be registered BEFORE data arrives. Insert into `channel_labels` immediately after `channel_open_session`, before `request_pty`.
