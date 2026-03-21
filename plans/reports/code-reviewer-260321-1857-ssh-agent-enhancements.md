# Code Review: SSH AI Agent Panel Enhancements

**Reviewer:** code-reviewer | **Date:** 2026-03-21
**Base:** d9be024 | **Head:** working tree (uncommitted)

---

## Scope

- **Files reviewed:** 14 (6 Rust, 4 TSX/TS, 4 workspace JS/MD)
- **LOC:** ~2,101 across reviewed files
- **Focus:** New agent config, audit, skill system, security boundaries, UI polish
- **Build status:** Rust `cargo check` PASS, TypeScript `tsc --noEmit` PASS

---

## Overall Assessment

Solid architecture. The skill registry, command blocklist, audit logging, and Tauri event bridge are well-structured and cleanly separated. The security surface is thoughtfully designed with layered defenses (blocklist regex, escaping, name validation, timeout clamping). However, there are **two critical issues** (UTF-8 panics, heredoc injection) and several high-priority items that should be addressed before merge.

---

## Critical Issues

### C1. UTF-8 Panic on String Slicing (agent_config.rs:78, agent_audit.rs:92)

**Problem:** `output[..self.max_output_bytes]` and `output[..PREVIEW_LEN]` will **panic at runtime** if the byte offset falls inside a multi-byte UTF-8 character. SSH terminal output regularly contains non-ASCII text (international locales, special characters).

**Impact:** Application crash on truncation of any output containing multi-byte chars near the boundary.

**Files:** `src-tauri/src/agent_config.rs:78`, `src-tauri/src/agent_audit.rs:92`

**Fix:**
```rust
// agent_config.rs — replace line 78
let boundary = output.floor_char_boundary(self.max_output_bytes);
let mut truncated = output[..boundary].to_string();

// agent_audit.rs — replace line 92
let boundary = output.floor_char_boundary(PREVIEW_LEN);
format!("{}...", &output[..boundary])
```

Note: `floor_char_boundary` is stable since Rust 1.82. If MSRV constraint is below that, use:
```rust
let mut boundary = self.max_output_bytes.min(output.len());
while !output.is_char_boundary(boundary) { boundary -= 1; }
```

### C2. Heredoc Injection in file.write Skill (ssh-skills.js:19)

**Problem:** The `file.write` skill embeds `p.content` raw inside a heredoc:
```js
`cat > ${esc(p.path)} << 'SKILL_EOF'\n${p.content}\nSKILL_EOF`
```
If `content` contains the literal string `SKILL_EOF` on its own line, the heredoc terminates early and the remainder executes as shell commands.

**Impact:** Arbitrary command execution on the remote SSH host. A malicious or careless `--content` value like:
```
SKILL_EOF
rm -rf /
cat << 'SKILL_EOF'
```
would break out of the heredoc.

**File:** `workspace/ssh-skills.js:19`

**Fix:** Either:
1. Use a unique/random delimiter per invocation:
```js
cmd: (p) => {
  const delim = `SKILL_EOF_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  return `cat > ${esc(p.path)} << '${delim}'\n${p.content}\n${delim}`;
}
```
2. Or use `printf '%s'` with escaped content instead of heredoc:
```js
cmd: (p) => `printf '%s' ${esc(p.content)} > ${esc(p.path)}`
```

---

## High Priority

### H1. Token File Permissions — World-Readable Auth Token

**Problem:** `agent-token` file at `~/.devtools/agent-token` is written with default permissions (likely 0644 on Linux, meaning any local user can read the auth token and connect to the agent WebSocket server).

**Impact:** Local privilege escalation — any process on the machine can steal the token and issue commands to SSH sessions.

**File:** `src-tauri/src/agent_server.rs:60`

**Fix (Unix):**
```rust
use std::os::unix::fs::OpenOptionsExt;
let mut opts = std::fs::OpenOptions::new();
opts.write(true).create(true).truncate(true);
#[cfg(unix)] opts.mode(0o600);
opts.open(dir.join("agent-token"))?.write_all(c.as_bytes())?;
```

### H2. Broadcast Channel Subscriber Lag Not Handled (agent_server.rs:206-210)

**Problem:** In `exec_cmd`, `orx.recv()` can return `Err(RecvError::Lagged(n))` when the 1024-message broadcast buffer overflows (e.g., a command producing rapid output). The current code treats `Err(_)` as connection closed and breaks, returning partial output without indicating data was lost.

**File:** `src-tauri/src/agent_server.rs:210`

**Fix:**
```rust
Ok(Err(broadcast::error::RecvError::Lagged(n))) => {
    out.push_str(&format!("\n[{n} messages lost due to buffer overflow]\n"));
    continue;
}
Ok(Err(_)) => break,
```

### H3. net.check_port Uses /dev/tcp Without Escaping Host in Double Quotes (ssh-skills.js:40)

**Problem:** `net.check_port` embeds `escName(p.host)` inside double-quoted string:
```js
`timeout 5 bash -c "echo >/dev/tcp/${escName(p.host)}/${parseInt(p.port)}" ...`
```
While `escName` restricts to `[\w@.\-:]+`, the value is placed inside double quotes where `$`, backticks, and `!` have special meaning. Current regex blocks these chars, but the defense is indirect — if the `escName` regex were ever relaxed, this becomes injectable.

**File:** `workspace/ssh-skills.js:40`

**Recommendation:** Use single quotes for the inner bash -c argument and inject the host via variable:
```js
cmd: (p) => `H=${escName(p.host)}; P=${parseInt(p.port)}; timeout 5 bash -c 'echo >/dev/tcp/$H/$P' 2>&1 && echo "OPEN" || echo "CLOSED"`
```

### H4. Workspace `ws` Dependency Not Installed (workspace/package.json)

**Problem:** `ssh-exec.js` requires `ws` module (`require("ws")`), but `ensure_workspace_files` only writes the package.json — it never runs `npm install`. The workspace will fail immediately with `MODULE_NOT_FOUND` on first use.

**File:** `src-tauri/src/claude_manager.rs:66-78`, `workspace/package.json`

**Fix:** Either:
1. Run `npm install` in `ensure_workspace_files` after writing package.json (only if `node_modules/ws` doesn't exist)
2. Or bundle `ws` inline / use the Node.js built-in WebSocket (available in Node 22+)

---

## Medium Priority

### M1. Doc Comment vs Implementation Mismatch (claude_manager.rs:64-76)

**Problem:** Lines 64-65 doc comment says "Write workspace scaffold files if they don't exist" and "Existing files are left untouched so user customizations are preserved." But line 75-76 comment and code say "Always overwrite to keep in sync with app version." These contradict each other.

**Fix:** Update the doc comment to match the actual behavior:
```rust
/// Write workspace scaffold files, overwriting to stay in sync with app version.
/// User customizations to these files will not persist across app restarts.
```

### M2. Command Blocklist Regex Easily Bypassed (agent_config.rs:84-91)

**Problem:** Default blocklist patterns are trivially bypassed:
- `rm\s+-rf\s+/\s*$` — bypassed by `rm -rf / --no-preserve-root`, `rm -rf /*`, `rm -rf /;echo`, or environment variable indirection
- Fork bomb pattern `:(){...|...};:` only matches one specific encoding

**Impact:** Blocklist provides false sense of security; determined misuse can bypass all patterns.

**File:** `src-tauri/src/agent_config.rs:84-91`

**Recommendation:** Document that blocklist is a "speed bump" not a security boundary. The real security is that the agent already has SSH access — blocklist prevents accidental catastrophic commands, not adversarial ones. Consider adding to CLAUDE.md or config docs.

### M3. AuditLog Silently Drops Entries on Mutex Poison (agent_audit.rs:41)

**Problem:** `if let Ok(mut entries) = self.entries.lock()` silently swallows a poisoned mutex. If any thread panics while holding the audit lock, all subsequent audit entries are silently dropped with no logging.

**File:** `src-tauri/src/agent_audit.rs:41`

**Recommendation:** At minimum log the error:
```rust
Err(e) => { log::error!("Audit mutex poisoned: {e}"); }
```

### M4. agent_server.rs Exceeds 200-Line File Size Guideline

**File:** `src-tauri/src/agent_server.rs` — 217 lines (guideline: 200 max)

**Recommendation:** Extract `exec_cmd`, `write_ch`, `resize_ch` into a separate `agent_commands.rs` module.

### M5. Single `Regex::new` Per Execute Request (agent_server.rs:199)

**Problem:** Each `Execute` request compiles a new regex from `prompt_pattern`. If the agent sends many rapid commands, this adds latency.

**Recommendation:** Cache compiled regex for repeated patterns, or document that custom patterns should be kept simple.

---

## Low Priority

### L1. `sendAndWait` in ssh-exec.js Has No Timeout (ssh-exec.js:49-61)

If the server never responds with a matching `id`, the promise hangs forever. Consider adding a timeout.

### L2. `process.exit(1)` in Skill Error Path Prevents Cleanup (ssh-exec.js:171-173)

`process.exit(1)` bypasses the `finally` block that calls `ws.close()`. Use `throw` instead.

### L3. AuditLog File Never Rotated (agent_audit.rs:48-56)

The JSONL file at `~/.devtools/agent-audit.jsonl` grows unbounded. Consider rotation or max file size.

### L4. Hardcoded `channel_id: "default"` in ssh-exec.js

All operations use channel_id `"default"`. If multiple channels exist per session, there's no way to target them from the CLI tool.

---

## Edge Cases Found by Scouting

1. **Empty session list + skill call:** `exec_cmd` correctly returns "Session not found" via `write_ch` error path. No crash.
2. **Malformed skill params:** `buildCommand` throws clear error for missing required params. Good.
3. **Concurrent broadcast subscribers:** Both the output forwarder (line 93) and `exec_cmd` (line 197) subscribe independently. If output is rapid, the exec subscriber may lag and lose data (see H2).
4. **Regex ReDoS in custom prompt_pattern:** User-supplied regex at line 199 could be catastrophic (e.g., `(a+)+$`). The `regex` crate is safe by default (linear time), so this is OK for Rust. The JS `ws` regex usage is also fine.
5. **AppHandle clone across thread boundary (lib.rs:50):** Tauri `AppHandle` is `Send + Sync`, so passing to the agent server thread is safe. Verified.
6. **`dirs::home_dir().unwrap_or_default()`:** On systems where home dir can't be determined, this returns `""`, leading to writes at paths like `.devtools/agent-token` relative to CWD. Low risk on desktop apps but worth noting.

---

## Positive Observations

- Clean separation: `AgentConfig`, `AuditLog`, `AgentProtocol` each in own file
- `esc()` function uses proper single-quote shell escaping technique (replace `'` with `'\''`)
- `escName()` with strict allowlist regex is the right approach for service/unit names
- `AgentResponse::Denied` variant — clean protocol extension for blocklist denials
- Audit log dual-write (memory ring + JSONL file) with Tauri event emission is well-designed
- `ClaudeAuditLog` component is well-optimized with `memo`, proper cleanup, and bounded entry list
- Risk badge integration in `ToolBlock` is unobtrusive and informative
- `include_str!` for workspace files — eliminates runtime file-not-found issues
- Timeout clamping (`MAX_TIMEOUT_CAP = 120_000`) prevents runaway commands
- Token-based WebSocket auth on localhost is appropriate for this threat model

---

## Recommended Actions (Priority Order)

1. **[CRITICAL] Fix UTF-8 slicing panics** in `agent_config.rs:78` and `agent_audit.rs:92` — use `floor_char_boundary` or manual boundary check
2. **[CRITICAL] Fix heredoc injection** in `ssh-skills.js:19` `file.write` — use random delimiter or printf
3. **[HIGH] Set token file permissions** to 0600 on Unix in `agent_server.rs:60`
4. **[HIGH] Handle broadcast lag** in `exec_cmd` to prevent silent data loss
5. **[HIGH] Ensure `ws` module is installed** in agent workspace (npm install or bundled)
6. **[MEDIUM] Fix doc comment mismatch** in `claude_manager.rs:64-65`
7. **[MEDIUM] Add mutex poison logging** in `agent_audit.rs:41`

---

## Metrics

| Metric | Value |
|---|---|
| Type Coverage (TS) | High — all props/state typed, `AuditEntry` interface matches Rust struct |
| Rust Compilation | PASS (0 warnings relevant to these files) |
| TS Compilation | PASS (0 errors) |
| Linting Issues | 0 blocking |
| Files > 200 lines | 3 (agent_server 217, claude_manager 425, claude-chat-pane 267) |

---

## Unresolved Questions

1. Is the workspace `ws` dependency expected to be installed by the user manually, or should the app handle it?
2. Should the blocklist be documented as "best effort" rather than a security boundary?
3. Is there a plan for audit log rotation, or is unbounded JSONL growth acceptable for this use case?
4. The `ensure_workspace_files` always overwrites — is losing user customizations to workspace files intentional? If so, the doc comment should be corrected. If not, the behavior should check existence first.
