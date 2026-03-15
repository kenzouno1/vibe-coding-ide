# Code Review: SSH Panel Feature

## Scope
- **Files reviewed**: 15 (3 Rust backend, 9 frontend TS/TSX, 3 modified integration files)
- **LOC**: ~1,100 new lines
- **Focus**: Security, thread safety, memory, error handling, DRY, type safety

## Overall Assessment

Solid implementation. Clean separation of concerns, good DRY extraction (xterm-config.ts), proper async patterns, and no credential logging. A few issues need attention -- most notably the SFTP-per-operation connection model and password-auth SFTP being broken.

---

## Critical Issues

### 1. SECURITY: Host key verification disabled (TOFU not implemented)
**File**: `ssh_manager.rs:28-31`, `sftp_ops.rs:26-30`
```rust
async fn check_server_key(&mut self, _server_public_key: &PublicKey) -> Result<bool, Self::Error> {
    Ok(true) // Accepts ALL keys -- MITM vulnerable
}
```
- **Impact**: Man-in-the-middle attacks possible. Users connecting to untrusted networks are exposed.
- **Fix**: Implement Trust-On-First-Use (TOFU). Store known host keys in `~/.devtools/known_hosts`. On first connect prompt user; on mismatch warn/block.
- **Severity**: Critical for production, acceptable for MVP if documented as known limitation.

### 2. SFTP password-auth connections always fail
**File**: `ssh-store.ts:135`
```ts
password: null, // Always null -- password-auth SFTP ops will fail
```
- **Impact**: Users with password-based SSH presets can browse terminal but SFTP operations silently fail (auth error caught by console.error only).
- **Fix**: Store the password in session state after connect, or re-prompt. Since passwords should not be persisted to disk, hold in-memory only within the Zustand store's connection record.

---

## High Priority

### 3. PERFORMANCE: New SSH+SFTP connection per SFTP operation
**File**: `sftp_ops.rs` -- `create_sftp_session()` called by every command
- Each list/upload/download/mkdir/delete creates a full TCP+SSH handshake+auth cycle
- Browsing a directory tree with N expansions = N separate SSH connections
- **Impact**: Very slow on high-latency links; excessive resource usage on server (may hit MaxSessions)
- **Fix**: Pool SFTP sessions per-host, reuse channel. Store `SftpSession` in a state map similar to `SshState`. Close on disconnect.

### 4. MEMORY: Large file download reads entire file into memory
**File**: `sftp_ops.rs:169-175`
```rust
let mut contents = Vec::new();
file.read_to_end(&mut contents).await // unbounded
```
- **Impact**: Downloading a 2GB file will OOM the app
- **Fix**: Stream to disk with chunked reads (e.g., 8KB buffer + tokio::fs::File writer)

### 5. MEMORY: Large file upload reads entire file into memory
**File**: `sftp_ops.rs:195-196`
```rust
let contents = std::fs::read(&local_path) // synchronous + unbounded
```
- Same OOM risk. Also uses blocking `std::fs::read` on async runtime.
- **Fix**: Use `tokio::fs::read` or chunked streaming. At minimum use `tokio::task::spawn_blocking`.

### 6. THREAD SAFETY: Lock held during async I/O in ssh_write
**File**: `ssh_manager.rs:178-187`
```rust
let sessions = state.sessions.lock().await; // lock held
session.channel.data(data.as_bytes()).await  // async I/O while locked
```
- **Impact**: All other operations (write, resize, disconnect) block until each write completes. Typing fast in one session could starve resize/disconnect calls. Same issue in `ssh_resize`.
- **Fix**: Clone the channel handle inside the lock scope, drop lock, then do async I/O on the clone.

---

## Medium Priority

### 7. DRY: Duplicated auth logic between ssh_manager.rs and sftp_ops.rs
- `create_sftp_session()` duplicates the entire auth flow from `ssh_connect()`
- **Fix**: Extract shared `authenticate_session(handle, method, username, password, key_path)` helper

### 8. DRY: Credential-passing boilerplate in sftp-browser.tsx
- Every SFTP invoke call rebuilds `{...credentials, password: null, privateKeyPath, authMethod}` -- 5 copies
- **Fix**: Extract `buildSftpArgs(credentials)` helper or pass credentials object to a single SFTP store method

### 9. ERROR HANDLING: SFTP errors only go to console.error
**Files**: `sftp-browser.tsx:59,83,104,124`
- User sees no feedback on failed upload/download/delete
- **Fix**: Add toast notification or inline error state

### 10. EDGE CASE: `__pending__` key in connections map
**File**: `ssh-store.ts:64`
```ts
__pending__: { presetId: preset.id, status: "connecting" }
```
- If two connect calls overlap, second overwrites first `__pending__`. Minor because `setConnecting` flag prevents this in UI, but fragile.
- **Fix**: Use `pending_${preset.id}` or a separate `connectingPresetId` state

### 11. TYPE SAFETY: auth_method is untyped string in Rust
**File**: `ssh_presets.rs:12`
```rust
pub auth_method: String, // should be enum
```
- Frontend has `"password" | "key"` union but Rust side accepts any string, falling through to error
- **Fix**: Use `#[serde(rename_all = "lowercase")] enum AuthMethod { Password, Key }`

### 12. SECURITY: No path traversal validation on SFTP delete
**File**: `sftp_ops.rs:232-256`
- Remote paths from frontend are passed directly to SFTP delete/mkdir without sanitization
- Low risk since SFTP server enforces permissions, but malicious frontend input could target sensitive paths
- **Fix**: Validate paths don't contain `..` sequences or at minimum log operations

### 13. EDGE CASE: Blocking FS in async context
**File**: `sftp_ops.rs:174` -- `std::fs::write` (sync) in async fn
- Could block tokio runtime thread
- **Fix**: Use `tokio::fs::write`

---

## Low Priority

### 14. SSH terminal missing paste handler
**File**: `ssh-terminal.tsx` -- handles Ctrl+V via clipboard API but no ClipboardEvent handler
- `terminal-pane.tsx` has a proper paste event handler with Rust clipboard fallback (file paths support)
- SSH terminal uses basic `navigator.clipboard.readText()` only
- **Fix**: Port the paste handler from terminal-pane.tsx for consistency

### 15. SshPreset form port validation
**File**: `ssh-preset-form.tsx:76` -- `Number(e.target.value)` can produce NaN or 0
- **Fix**: Clamp to 1-65535 range

### 16. Recursive SFTP delete won't work on non-empty directories
**File**: `sftp_ops.rs:248` -- `remove_dir` fails if directory is not empty
- Standard SFTP limitation, but user gets unhelpful error
- **Fix**: Either implement recursive delete or show clear error message

---

## Positive Observations

- No passwords logged or persisted to disk -- security-conscious design
- xterm-config.ts extraction is good DRY practice, properly shared with terminal-pane.tsx
- Event listener cleanup in use-ssh.ts is thorough (destroyed flag + unlisten)
- Proper use of `memo` on SshTerminal and SftpTreeNode to prevent re-renders
- SSH view placed outside the per-project tab loop in app.tsx -- correct architectural decision
- IME handler integration consistent with existing terminal-pane.tsx pattern
- ResizeObserver with debounce matches established pattern
- Breadcrumb navigation in SFTP browser is well-implemented

---

## Recommended Actions (Priority Order)

1. **Fix SFTP password passthrough** -- password-auth SFTP is completely broken (#2)
2. **Stream large file transfers** -- prevents OOM crashes (#4, #5)
3. **Release lock before async I/O** in ssh_write/ssh_resize (#6)
4. **Pool SFTP sessions** instead of per-operation connections (#3)
5. **Add user-visible error feedback** for SFTP operations (#9)
6. **Extract shared auth helper** to reduce duplication (#7)
7. **Consider TOFU** for host key verification (#1) -- can defer if MVP

---

## Unresolved Questions

- Is password-auth SFTP intended to be supported? The store always passes `null` for password to SFTP commands.
- Is there a max file size policy for SFTP transfers? Without streaming, current impl is limited to available RAM.
- Should SSH sessions survive view switches or tab changes? Currently they persist in state but the terminal component remounts could cause issues if sessionId changes.
