# Claude Chat Panel — Implementation Plan

## Overview
Add a Claude AI chat panel to DevTools, similar to Claude for VSCode / Cursor. Users can choose between **CLI terminal** or **Claude chat** when creating new panes. Communication uses Claude Code CLI subprocess with `--output-format stream-json` for real-time streaming.

## Architecture Decision

**Approach: Claude Code CLI subprocess with structured JSON streaming**

- Spawn `claude -p "<msg>" --output-format stream-json --verbose --cwd <project>` per message
- Parse NDJSON output line-by-line, emit as Tauri events to frontend
- Use `--resume <session-id>` for conversation continuity
- Gets full Claude Code capabilities (file editing, shell commands, MCP) for free

**Why not direct Anthropic API?**
- Claude Code CLI includes tool use, file context, MCP out of the box
- No need to reimplement tool calling infrastructure
- Users with Claude Code installed can use immediately
- Same experience as VSCode extension

## Tech Stack Additions
| Package | Size | Purpose |
|---------|------|---------|
| `react-textarea-autosize` | 1.3KB | Chat input that grows |
| `react-virtuoso` | 35KB | Virtualized message list |

No new Rust crates needed — uses `std::process::Command` with stdout piping.

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | [Pane type system](phase-01-pane-type-system.md) | pending | pane-store.ts, split-pane-container.tsx |
| 2 | [Claude backend](phase-02-claude-backend.md) | pending | claude_manager.rs, lib.rs |
| 3 | [Claude store](phase-03-claude-store.md) | pending | claude-store.ts |
| 4 | [Chat UI components](phase-04-chat-ui.md) | pending | claude-chat-pane.tsx, claude-message-list.tsx, claude-input.tsx |
| 5 | [Integration & polish](phase-05-integration.md) | pending | sidebar.tsx, app-store.ts, keyboard shortcuts |

## Key Constraints
- Keep individual files under 200 lines
- Reuse existing patterns: Zustand store, Tauri IPC events, xterm config
- Reuse existing `markdown-preview.tsx` for message rendering
- No API key management — relies on user's installed `claude` CLI
