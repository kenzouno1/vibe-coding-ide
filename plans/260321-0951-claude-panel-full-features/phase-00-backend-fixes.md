# Phase 0: Critical Backend Fixes

## Context
- [Researcher report](../../plans/reports/researcher-260321-0953-claude-cli-full-features.md)
- [claude_manager.rs](../../src-tauri/src/claude_manager.rs)

## Overview
- **Priority:** Critical
- **Status:** Pending
- Fix silent hang when Claude tries tool use without permission flags

## Problem
Current `claude_send_message` spawns Claude without permission or tool approval flags. If Claude attempts `Edit`, `Bash`, or other tools, the process hangs indefinitely waiting for interactive permission approval that can never come in `-p` mode.

## Implementation Steps

1. **Add permission and safety flags to `claude_manager.rs`**

   Update `claude_send_message` Command construction:
   ```rust
   cmd.arg("-p")
       .arg(&message)
       .arg("--output-format").arg("stream-json")
       .arg("--verbose")
       .arg("--permission-mode").arg("acceptEdits")
       .arg("--allowedTools").arg("Read,Edit,Write,Bash,Glob,Grep,WebSearch,WebFetch")
       .arg("--max-turns").arg("25");
   ```

   - `--permission-mode acceptEdits` — auto-accepts file edits, prevents hang
   - `--allowedTools` — whitelist safe tools
   - `--max-turns 25` — prevents runaway agents draining budget

2. **Make flags configurable** (optional, future)
   - Accept `permission_mode` and `max_turns` params from frontend
   - Default to safe values

## Related Code Files

### Modify
- `src-tauri/src/claude_manager.rs` — Add flags to Command args

## Todo List
- [ ] Add `--permission-mode acceptEdits` flag
- [ ] Add `--allowedTools` whitelist
- [ ] Add `--max-turns 25` safety limit

## Success Criteria
- Claude can edit files without hanging
- Runaway agents stop after 25 turns
- No behavior regression for simple Q&A messages
