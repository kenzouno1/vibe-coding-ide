# Phase 02: Test Vietnamese Input End-to-End

**Priority:** High | **Status:** Pending | **Effort:** Small

## Overview

Verify Vietnamese IME input works through full pipeline: xterm.js → Tauri IPC → portable-pty → shell/claude.

## Test Cases

- [ ] Type "xin chaof" in terminal → displays "xin chào"
- [ ] Type "Vieejt Nam" → displays "Việt Nam"
- [ ] Run `echo "tiếng Việt"` → correct output
- [ ] Run `claude` → type Vietnamese prompt → correct input
- [ ] Paste Vietnamese text → correct display
- [ ] Rapid Vietnamese typing → no corruption
- [ ] Switch between Vietnamese/English IME → no stuck state

## Success Criteria
- All test cases pass
- No UTF-8 corruption in PTY output
