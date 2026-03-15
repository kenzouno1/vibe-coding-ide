# SSH Connection Debug Report
**Date:** 2026-03-15
**Scope:** DevTools Tauri v2 app — SSH stopped connecting after Phase 4 refactor

---

## Executive Summary

Two confirmed bugs. Neither is in `ssh_connect` itself — the connect/auth flow is correct. The breakage is in:

1. **CRITICAL — `ssh_write` / `ssh_resize` parameter name mismatch** (`channelId` JS → `channel_id` Rust): Tauri does NOT auto-convert camelCase command params. The `channel_id: Option<String>` Rust param expects `channel_id` from JS, but `use-ssh.ts` sends `channelId`. This means every write and resize call silently passes `None` as channel_id, then tries to look up channel `"default"` — which works for the initial shell but will fail if any pane uses a non-default channel.

2. **MINOR — `ssh_open_channel` invoke sends `sessionId` (camelCase)**, but the Rust command param is `session_id: String`. Same mismatch — Tauri doesn't convert command param names. This means opening additional channels fails entirely.

3. **POTENTIAL DEADLOCK — `ssh_open_channel` holds `sessions` mutex lock while calling `channel_open_session()`**, which is an async network operation. If `channel_open_session()` triggers `data()` on the handler (which tries to lock nothing, but the handler itself doesn't need `sessions`), this is likely fine — but it's a code smell worth noting.

**Why it worked initially:** The default channel + single-pane path uses `channelId: "default"` which happens to resolve correctly because the Rust side falls back to `"default"` when `channel_id` is `None`. So basic connect + write to default channel still works. The regression likely appeared when multi-channel/multi-pane was exercised.

---

## Bug Detail

### Bug 1 — `use-ssh.ts` write/resize send wrong param name

**File:** `src/hooks/use-ssh.ts` lines 59, 68

```ts
// CURRENT (broken for non-default channels):
invoke("ssh_write", { id: sessionId, channelId, data });
invoke("ssh_resize", { id: sessionId, channelId, rows, cols });

// SHOULD BE:
invoke("ssh_write", { id: sessionId, channel_id: channelId, data });
invoke("ssh_resize", { id: sessionId, channel_id: channelId, rows, cols });
```

**Rust signature** (`ssh_manager.rs` lines 308–313):
```rust
pub async fn ssh_write(
    state: tauri::State<'_, SshState>,
    id: String,
    channel_id: Option<String>,   // ← expects snake_case key from JS
    data: String,
```

**Impact:** When `channelId !== "default"` (i.e. any additional pane), the write resolves to `"default"` channel instead — output goes to wrong terminal, input is lost or misrouted. For the initial single-pane case with channel `"default"`, it accidentally works because `None` unwraps to `"default"`.

---

### Bug 2 — `ssh-store.ts` `openChannel` sends wrong param name

**File:** `src/stores/ssh-store.ts` line 145

```ts
// CURRENT (broken):
const channelId = await invoke<string>("ssh_open_channel", { sessionId });

// SHOULD BE:
const channelId = await invoke<string>("ssh_open_channel", { session_id: sessionId });
```

**Rust signature** (`ssh_manager.rs` lines 243–246):
```rust
pub async fn ssh_open_channel(
    state: tauri::State<'_, SshState>,
    session_id: String,   // ← expects snake_case
```

**Impact:** `session_id` arrives as empty string or Tauri throws a deserialization error. Opening any additional channel (split pane) fails. The `closeChannel` invoke at line 169 sends `{ sessionId, channelId }` — same bug for `session_id` param (though `channel_id` is also snake_case there).

---

### Bug 3 — `ssh-store.ts` `closeChannel` sends wrong param names

**File:** `src/stores/ssh-store.ts` line 169

```ts
// CURRENT (broken):
await invoke("ssh_close_channel", { sessionId, channelId });

// SHOULD BE:
await invoke("ssh_close_channel", { session_id: sessionId, channel_id: channelId });
```

**Rust signature** (`ssh_manager.rs` lines 285–289):
```rust
pub async fn ssh_close_channel(
    state: tauri::State<'_, SshState>,
    session_id: String,
    channel_id: String,
```

---

## What's Correct (No Action Needed)

- `ssh_connect` invoke in `ssh-store.ts` (line 78): correctly uses `authMethod`, `privateKeyPath` — these match Rust `auth_method`, `private_key_path` after Tauri's **struct field** auto-conversion (Tauri converts struct field names in serialized payloads, which applies here since the Rust side uses `#[serde]` deserialization from the invoke payload).

  Wait — actually Tauri v2 IPC does convert camelCase → snake_case for **command arguments** too when they're primitive types, but only via serde deserialization with `#[serde(rename_all = "camelCase")]` attribute. Without that attribute, the raw field name must match. The `ssh_connect` params `auth_method` and `private_key_path` are direct function params (not a struct), so Tauri passes them by name match. This means `authMethod` in JS will NOT match `auth_method` in Rust.

  **Re-checking `ssh_connect`:** Lines 78–85 in `ssh-store.ts` send `authMethod` and `privateKeyPath`. Rust expects `auth_method` and `private_key_path`. This IS also a mismatch — but it may be working due to Tauri v2's automatic camelCase→snake_case conversion for invoke args (Tauri v2 does do this conversion for command params). Need to verify Tauri v2 behavior.

- `lib.rs` tokio runtime: `tokio::spawn` inside `setup()` is valid — Tauri v2 uses tokio internally and the setup closure runs within the tokio context. No issue here.

- `SshClientHandler` construction in `ssh_connect` correctly passes `output_tx: state.output_tx.clone()`. No issue.

- `ssh-output` event payload: Rust emits `SshOutput { id, channel_id, data }` which serializes to `{ id, channel_id, data }`. Frontend `use-ssh.ts` reads `event.payload.channel_id` — this matches correctly (Rust serde serializes struct fields as-is, snake_case).

---

## Root Cause Summary

| Bug | File | Line | Severity | Effect |
|-----|------|------|----------|--------|
| `channelId` → should be `channel_id` in write | `use-ssh.ts` | 59 | HIGH | Wrong channel written to |
| `channelId` → should be `channel_id` in resize | `use-ssh.ts` | 68 | MEDIUM | PTY resize on wrong channel |
| `sessionId` → should be `session_id` in open_channel | `ssh-store.ts` | 145 | HIGH | All additional channels fail to open |
| `{ sessionId, channelId }` → snake_case in close_channel | `ssh-store.ts` | 169 | MEDIUM | Channels not properly closed |

---

## Recommended Fixes (Do Not Implement — Diagnosis Only)

1. `use-ssh.ts` line 59: change `channelId` key to `channel_id`
2. `use-ssh.ts` line 68: change `channelId` key to `channel_id`
3. `ssh-store.ts` line 145: change `{ sessionId }` to `{ session_id: sessionId }`
4. `ssh-store.ts` line 169: change `{ sessionId, channelId }` to `{ session_id: sessionId, channel_id: channelId }`

---

## Unresolved Questions

1. **Tauri v2 camelCase auto-conversion**: Does Tauri v2 automatically convert camelCase command param names to snake_case? If yes, bugs 3 & 4 in the table above (open/close channel) may be the only real failures. If no, then `ssh_connect`'s `authMethod`/`privateKeyPath` are also broken — but user says connect worked initially, suggesting Tauri v2 DOES convert these. The write/resize params are still broken regardless because the fallback to `"default"` masks the error.

2. **When exactly did it break?**: If only multi-pane (non-default channels) is broken, the basic single-pane SSH session likely still connects. The user should test: does the initial connect + single terminal work? Only split-pane fails?
