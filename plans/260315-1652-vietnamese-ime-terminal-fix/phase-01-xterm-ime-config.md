# Phase 01: Configure xterm.js IME Support

**Priority:** High | **Status:** Pending | **Effort:** Small

## Overview

xterm.js v6 has built-in IME composition support. Current terminal-pane.tsx doesn't explicitly configure it. Need to verify it works and fix if not.

## Key Insights

- xterm.js uses a hidden `<textarea>` overlay for IME composition — this is standard browser IME behavior
- `term.onData()` already fires with composed text (not raw keystrokes) when IME is active
- The real question: does our current setup accidentally break IME? (e.g., `attachCustomKeyEventHandler` intercepting composition keys)

## Requirements

### Functional
- Vietnamese Telex/VNI input works in terminal (typing "chaof" → "chào")
- IME composition window appears at correct position near cursor
- Works when running `claude` CLI inside the terminal

### Non-functional
- No regression in normal ASCII input
- Copy/paste still works
- No performance impact

## Implementation Steps

### 1. Verify xterm.js IME defaults
xterm.js v6 Terminal options to check:
- `windowsMode` — may affect IME on Windows
- No explicit IME toggle exists — it's always on via textarea element

### 2. Fix `attachCustomKeyEventHandler` interference
Current code intercepts Ctrl+V/Ctrl+C. Check if it accidentally blocks IME-related keys.

```typescript
// Current — returns true for all non-handled keys (correct)
term.attachCustomKeyEventHandler((e) => {
  if (e.type === "keydown" && e.ctrlKey && e.key === "v") { ... return false; }
  if (e.type === "keydown" && e.ctrlKey && e.key === "c" && term.hasSelection()) { ... return false; }
  return true; // ← allows IME through
});
```

This looks correct. IME composition events shouldn't trigger `keydown` with Ctrl.

### 3. Ensure PTY handles UTF-8 correctly
In `pty_manager.rs`, check `from_utf8_lossy()` — if Vietnamese bytes are split across read boundaries, lossy conversion will corrupt them. May need to buffer partial UTF-8 sequences.

### 4. Add `windowsPty` option (if needed)
```typescript
const term = new Terminal({
  // ... existing config
  windowsPty: {
    backend: 'conpty',
    buildNumber: 18309
  }
});
```

### 5. Test Vietnamese input
1. Run app → open terminal
2. Type Vietnamese with Telex: "xin chaof" → should produce "xin chào"
3. Run `claude` inside terminal → type Vietnamese prompt

## Related Code Files

### Modify
- `src/components/terminal-pane.tsx` — Terminal config
- `src-tauri/src/pty_manager.rs` — UTF-8 buffering (if needed)

## Success Criteria
- [ ] Vietnamese Telex input produces correct diacritics
- [ ] IME composition window visible during typing
- [ ] Works inside `claude` CLI running in terminal
- [ ] No regression in ASCII input, copy/paste

## Risk Assessment
- **Low**: xterm.js IME is built-in, likely just needs verification
- **Medium**: Rust PTY `from_utf8_lossy` may corrupt split UTF-8 sequences — need buffering fix
