# Code Review: UTF-8 Safe Buffering in PTY Reader

**File:** `src-tauri/src/pty_manager.rs`
**Date:** 2026-03-15
**Scope:** `split_at_utf8_boundary()` helper + reader thread buffering logic (lines 9-21, 110-149)
**LOC changed:** ~40

## Overall Assessment

Solid fix. The approach is correct and well-understood: buffer incomplete trailing bytes between reads, emit only validated UTF-8. The `split_at_utf8_boundary` function correctly leverages `std::str::from_utf8`'s error reporting. Two issues found -- one is a **critical bug**, one is medium priority.

---

## Critical Issues

### 1. BUG: Leftover buffer aliasing causes data corruption or loss

**Lines 122-127:**
```rust
let chunk = if leftover.is_empty() {
    &buf[..n]
} else {
    leftover.extend_from_slice(&buf[..n]);
    leftover.as_slice()
};
```

**Line 144:**
```rust
leftover = remainder.to_vec();
```

**Problem:** When leftover is non-empty, new data is appended to `leftover`, and `chunk` borrows it. After processing, line 144 does `leftover = remainder.to_vec()` which replaces `leftover` with a new `Vec`. This works correctly in Rust because `remainder.to_vec()` copies the bytes before reassigning.

**Wait -- re-analysis:** Actually, `remainder` is a sub-slice of `chunk`, which borrows `leftover`. The `.to_vec()` call copies the bytes into a new allocation *before* the old `leftover` is dropped. Rust's borrow checker allows this because `.to_vec()` produces an owned `Vec<u8>` with no borrow on the original. The reassignment then drops the old `leftover`. This is **safe and correct**.

**Verdict:** No bug here. Revised to medium observation below.

---

## High Priority

### 1. Unbounded leftover accumulation (theoretical)

If the PTY produces a stream of bytes that never forms valid UTF-8 (e.g., binary output, corrupted stream), `leftover` grows without bound because `valid` is always empty and `remainder` keeps accumulating.

**Impact:** Memory leak in degenerate case. PTY output would silently stall (no events emitted).

**Fix:**
```rust
// After split_at_utf8_boundary, add a safety valve:
if leftover.len() > 4 {
    // Max UTF-8 character is 4 bytes. If leftover exceeds this,
    // the stream contains invalid UTF-8. Emit with replacement char.
    let data = String::from_utf8_lossy(&leftover).to_string();
    let _ = app.emit("pty-output", PtyOutput { id: session_id.clone(), data });
    leftover.clear();
}
```

A UTF-8 character is at most 4 bytes. If `leftover` exceeds 4 bytes after splitting, the stream is genuinely invalid, not just split across a boundary. Flushing with `from_utf8_lossy` at that point is the right fallback.

---

## Medium Priority

### 1. `unsafe` usage is correct but could be avoided

**Line 133:** `unsafe { std::str::from_utf8_unchecked(valid) }`

The SAFETY comment is accurate -- `split_at_utf8_boundary` does guarantee validity because `from_utf8` returns `valid_up_to`. However, `std::str::from_utf8(valid).unwrap()` would be equally fast here (the validation already happened in `split_at_utf8_boundary`, but the compiler doesn't know that, so it would re-validate). The performance difference is negligible for 4KB chunks.

**Recommendation:** Keep `unsafe` if performance is a concern, but consider `from_utf8(valid).unwrap()` for defense-in-depth. The unsafe is correct but adds audit burden.

### 2. Allocation on every read when leftover is non-empty

When `leftover` is non-empty, every read does:
- `extend_from_slice` (potential realloc of leftover Vec)
- `remainder.to_vec()` (new allocation)

In practice, leftover will almost always be 1-3 bytes (incomplete UTF-8 tail), so allocations are tiny. Not a real performance concern.

---

## Low Priority

### 1. Thread does not log errors on exit

Line 146: `Err(_) => break` silently swallows read errors. Consider logging at debug level for diagnostics.

### 2. No cleanup signal when reader thread exits

When the reader loop breaks (EOF or error), the frontend receives no notification that the PTY session ended. The session remains in the `sessions` HashMap as a zombie. Consider emitting a "pty-closed" event on loop exit.

---

## Edge Cases Analyzed

| Scenario | Behavior | Status |
|----------|----------|--------|
| Empty read (n=0) | Breaks loop | OK |
| All-ASCII stream | `from_utf8` succeeds, no splitting needed | OK |
| Multi-byte char split at boundary | Trailing bytes buffered, completed on next read | OK |
| 4-byte char split 1+3 or 2+2 or 3+1 | Handled correctly by `valid_up_to` | OK |
| Leftover from previous read + new complete data | `extend_from_slice` joins them | OK |
| Binary/invalid UTF-8 stream | **Leftover grows unbounded** | BUG |
| Very large leftover (e.g., binary dump) | Silent memory growth | BUG |
| Read returns only leftover-completing bytes | Works -- leftover joined, validated, emitted | OK |

---

## Positive Observations

- Clean separation of concerns: boundary logic extracted into testable pure function
- Good doc comments explaining the "why" (Vietnamese, CJK)
- Correct use of `std::str::from_utf8`'s error type -- `valid_up_to()` is exactly the right API
- No unnecessary cloning in the happy path (leftover empty)

---

## Recommended Actions

1. **[HIGH]** Add leftover size guard (flush with `from_utf8_lossy` if > 4 bytes) to prevent unbounded growth on binary output
2. **[LOW]** Emit "pty-closed" event when reader loop exits
3. **[LOW]** Log read errors at debug level instead of silently breaking
4. **[OPTIONAL]** Replace `unsafe` with safe `from_utf8().unwrap()` for defense-in-depth

---

## Metrics

- Type Coverage: N/A (Rust -- compiler-enforced)
- Test Coverage: No unit tests for `split_at_utf8_boundary` -- recommend adding
- Linting Issues: 0 (assuming `cargo clippy` passes)
- Unsafe blocks: 1 (justified, correct)

## Unresolved Questions

- Is binary PTY output a realistic scenario for this app (e.g., `cat /dev/urandom`, image previews)? If yes, the leftover guard is important. If the terminal only handles text, it's lower priority.
- Should zombie sessions (reader exited but session still in HashMap) be cleaned up automatically?
