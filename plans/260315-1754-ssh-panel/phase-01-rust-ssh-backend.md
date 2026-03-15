# Phase 1: Rust SSH Backend

## Context
- [pty_manager.rs](../../src-tauri/src/pty_manager.rs) — reference pattern for session management + event streaming
- [Cargo.toml](../../src-tauri/Cargo.toml) — add `ssh2` dependency
- [lib.rs](../../src-tauri/src/lib.rs) — register new commands + managed state

## Overview
- **Priority:** P1 (blocks all other phases)
- **Status:** done
- **Effort:** 3h

## Key Insights
- Mirror pty_manager pattern: state struct with `Arc<Mutex<HashMap<String, SshSession>>>`, reader thread emitting "ssh-output" events
- ssh2 crate Channel requires explicit `request_pty()` + `shell()` to get interactive terminal
- Must handle TCP connection + SSH handshake in a single `ssh_connect` command
- SFTP operations use `session.sftp()` subsystem — separate from shell channel

## Architecture

```
ssh_connect(host, port, user, auth) → spawn TCP → SSH handshake → request PTY → shell()
  └── reader thread: channel.read() → emit("ssh-output", {id, data})

ssh_write(id, data) → channel.write(data)
ssh_resize(id, rows, cols) → channel.request_pty_size(cols, rows)
ssh_disconnect(id) → drop session
```

## Files to Create
- `src-tauri/src/ssh_manager.rs` (~180 lines)

## Files to Modify
- `src-tauri/Cargo.toml` — add `ssh2 = "0.9"` dependency
- `src-tauri/src/lib.rs` — add `mod ssh_manager`, register `SshState`, register commands

## Implementation Steps

### 1. Add ssh2 dependency
```toml
# Cargo.toml [dependencies]
ssh2 = "0.9"
```

### 2. Create ssh_manager.rs

```rust
// Core structures
pub struct SshSession {
    session: ssh2::Session,
    writer: ssh2::Channel, // for write_all
}

pub struct SshState {
    sessions: Arc<Mutex<HashMap<String, SshSession>>>,
}
```

### 3. Implement `ssh_connect` command
```rust
#[tauri::command]
pub async fn ssh_connect(
    state: tauri::State<'_, SshState>,
    app: AppHandle,
    host: String,
    port: u16,
    username: String,
    auth_method: String,       // "password" | "key"
    password: Option<String>,
    private_key_path: Option<String>,
) -> Result<String, String>
```

Steps inside:
1. `TcpStream::connect((host, port))` — use `spawn_blocking` or thread since ssh2 is blocking
2. `Session::new()` + `session.set_tcp_stream(tcp)` + `session.handshake()`
3. Auth: `session.userauth_password()` or `session.userauth_pubkey_file()`
4. `session.channel_session()` → `channel.request_pty("xterm", None, Some((80, 24, 0, 0)))` → `channel.shell()`
5. Clone channel reader, spawn thread for output streaming (same UTF-8 safe pattern as pty_manager)
6. Store session, return UUID

### 4. Implement `ssh_write` command
```rust
#[tauri::command]
pub fn ssh_write(state: tauri::State<'_, SshState>, id: String, data: String) -> Result<(), String>
```
- Lock sessions, get channel, `channel.write_all(data.as_bytes())`

### 5. Implement `ssh_resize` command
```rust
#[tauri::command]
pub fn ssh_resize(state: tauri::State<'_, SshState>, id: String, rows: u16, cols: u16) -> Result<(), String>
```
- `channel.request_pty_size(cols as u32, rows as u32, None, None)`

**Note:** ssh2 Channel doesn't expose `request_pty_size` directly on an existing channel easily. Alternative: send SIGWINCH via `channel.exec("kill -WINCH $$")` — but better approach is to use `session.channel_session()` to send a window-change request. Actually, `channel.request_pty_size()` does exist in ssh2 crate. Verify API.

### 6. Implement `ssh_disconnect` command
```rust
#[tauri::command]
pub fn ssh_disconnect(state: tauri::State<'_, SshState>, id: String) -> Result<(), String>
```
- Remove from HashMap, drop closes connection

### 7. Implement SFTP commands
```rust
#[tauri::command]
pub fn sftp_list_dir(state: tauri::State<'_, SshState>, id: String, path: String) -> Result<Vec<SftpEntry>, String>

#[tauri::command]
pub fn sftp_download(state: tauri::State<'_, SshState>, id: String, remote_path: String, local_path: String) -> Result<(), String>

#[tauri::command]
pub fn sftp_upload(state: tauri::State<'_, SshState>, id: String, local_path: String, remote_path: String) -> Result<(), String>

#[tauri::command]
pub fn sftp_mkdir(state: tauri::State<'_, SshState>, id: String, path: String) -> Result<(), String>

#[tauri::command]
pub fn sftp_delete(state: tauri::State<'_, SshState>, id: String, path: String) -> Result<(), String>
```

SftpEntry struct:
```rust
#[derive(Serialize, Deserialize)]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub permissions: u32,
    pub modified: u64, // unix timestamp
}
```

**Important:** SFTP operations use `session.sftp()` which creates an SFTP subsystem channel. This can coexist with the shell channel on the same SSH session. Cache the Sftp handle or create on each call (creating is cheap).

### 8. Register in lib.rs
```rust
mod ssh_manager;
use ssh_manager::SshState;

// In run():
.manage(SshState::new())
// In invoke_handler:
ssh_manager::ssh_connect,
ssh_manager::ssh_write,
ssh_manager::ssh_resize,
ssh_manager::ssh_disconnect,
ssh_manager::sftp_list_dir,
ssh_manager::sftp_download,
ssh_manager::sftp_upload,
ssh_manager::sftp_mkdir,
ssh_manager::sftp_delete,
```

## File Size Consideration
ssh_manager.rs may exceed 200 lines with all SFTP commands. Split into two files if needed:
- `ssh_manager.rs` — connect/write/resize/disconnect + SshState (~120 lines)
- `sftp_ops.rs` — SFTP commands using shared SshState (~100 lines)

## Todo
- [ ] Add `ssh2 = "0.9"` to Cargo.toml
- [ ] Create ssh_manager.rs with SshState struct
- [ ] Implement ssh_connect with TCP + handshake + PTY + reader thread
- [ ] Implement ssh_write, ssh_resize, ssh_disconnect
- [ ] Create sftp_ops.rs with list/download/upload/mkdir/delete
- [ ] Register all commands in lib.rs
- [ ] Test compilation

## Success Criteria
- `cargo build` succeeds
- ssh_connect establishes connection and streams output to "ssh-output" event
- SFTP operations return correct data

## Risk Assessment
- **ssh2 crate on Windows**: ssh2 depends on libssh2 + OpenSSL. May need `vendored` feature flag: `ssh2 = { version = "0.9", features = ["vendored-openssl"] }` to avoid system OpenSSL dependency on Windows
- **Blocking I/O**: ssh2 is synchronous. ssh_connect must run on a blocking thread (`tauri::async_runtime::spawn_blocking` or `std::thread`). Reader thread is already separate.
- **Channel thread safety**: ssh2::Channel is not Send. May need to keep all channel operations on the same thread. Workaround: spawn a dedicated thread per session that owns the channel and receives commands via mpsc channel.

## Security
- Never log passwords
- Private key paths validated (must exist)
- Credential data not persisted (only preset metadata saved; password prompted each time)
