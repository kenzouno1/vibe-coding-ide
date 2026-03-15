# Vietnamese IME Input Fix for Terminal

**Created:** 2026-03-15
**Status:** Complete
**Priority:** High

## Problem

Vietnamese diacritical input (tiếng Việt có dấu) broken in Claude Code CLI and coding agents. Root cause: React Ink's TextInput uses terminal raw mode, bypasses IME composition events. User wants to run Claude Code inside devtools' xterm.js terminal where IME can be properly handled.

## Research Summary

| Solution | Patches Claude? | Effectiveness | Maintenance |
|----------|----------------|---------------|-------------|
| `npx fix-vietnamese-claude-code` | Yes (binary patch) | High | Per-update |
| Windows Terminal v1.21+ | No | Low-Medium | One-time |
| External editor + paste | No | High | Manual |
| **This app's xterm.js terminal** | **No** | **High** | **None** |

**Our approach**: xterm.js v6 has built-in IME composition support. By properly configuring it in our Tauri terminal, Vietnamese input will be handled by xterm.js before sending to PTY — completely bypassing Claude Code's broken Ink TextInput.

## Key Insight

When running `claude` CLI inside our xterm.js terminal:
- xterm.js handles IME composition → sends final composed text to PTY
- Claude Code receives completed Vietnamese text via STDIN, not raw keystrokes
- No patching needed — Claude Code only gets final UTF-8 characters

## Current Issues in Codebase

1. **No IME-specific config** in Terminal constructor (`terminal-pane.tsx:83-88`)
2. **`term.onData()` is correct** — xterm.js already handles IME internally and fires `onData` with composed text
3. **Missing**: `allowProposedApi` may be needed for IME features
4. **Rust PTY** uses `from_utf8_lossy()` which replaces invalid UTF-8 (could mask issues)

## Phases

| Phase | Description | Status | File |
|-------|-------------|--------|------|
| 01 | Investigate & configure xterm.js IME | **Done** | [phase-01](./phase-01-xterm-ime-config.md) |
| 02 | Test Vietnamese input end-to-end | Manual testing needed | [phase-02](./phase-02-testing.md) |

## Risk Assessment

- **Low risk**: xterm.js v6 natively supports IME — this is configuration, not custom implementation
- **Possible issue**: `portable-pty` on Windows may not pass UTF-8 correctly — need to verify Rust side
