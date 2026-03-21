# Claude Panel Full Features — Implementation Plan

## Overview
Upgrade Claude chat panel from basic one-shot `-p` mode to a full-featured Claude Code experience. Support slash commands, skills, image paste, file attachments, enhanced streaming, and session management.

## Architecture Decision

**Keep `-p` mode + enhance client-side.** The Claude CLI `-p` mode with `--output-format stream-json` provides all the backend capabilities needed. The gap is entirely in the frontend UX layer.

**CRITICAL FINDING:** Slash commands are **interactive-mode only**. Passing `/plan` via `-p` sends it literally to the LLM — it does NOT invoke the skill system. ALL slash commands must be implemented client-side.

**What needs client-side handling:**
- ALL slash commands — intercept before sending to CLI
- `/clear` → local state reset
- `/model <name>` → restart with `--model` flag
- `/compact` → send summarization prompt with `--resume`
- `/cost` → display accumulated cost from result events
- `/help` → render static command list
- `/plan` → use `--permission-mode plan` flag
- Autocomplete dropdown for `/` prefix
- Image input → save to temp file, include path in message (Claude's Read tool handles images natively)
- Enhanced stream event parsing for richer UI

**CRITICAL BUG FIX NEEDED:** Current backend is missing `--permission-mode`, `--allowedTools`, `--max-turns` flags. Claude can hang silently when trying to edit files without permission approval.

## Phases

| # | Phase | Status | Priority |
|---|-------|--------|----------|
| 0 | [Critical backend fixes](phase-00-backend-fixes.md) | complete | critical |
| 1 | [Slash command system](phase-01-slash-commands.md) | complete | high |
| 2 | [Image paste & file attachment](phase-02-image-paste.md) | complete | high |
| 3 | [Enhanced streaming](phase-03-enhanced-streaming.md) | complete | medium |
| 4 | [Session management](phase-04-session-management.md) | complete | medium |
| 5 | [Input UX polish](phase-05-input-ux.md) | complete | low |

## Key Constraints
- Files under 200 lines each
- Reuse existing Zustand patterns, Tauri IPC, markdown-preview
- No new Rust crates needed (existing `std::process::Command` sufficient)
- No API key management — relies on user's `claude` CLI installation
- YAGNI: Only implement features that make sense in a chat panel context
