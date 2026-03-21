# Phase 1: Slash Command System

## Context
- [Existing claude-chat-pane.tsx](../../src/components/claude-chat-pane.tsx)
- [Existing claude-input.tsx](../../src/components/claude-input.tsx)
- [Claude store](../../src/stores/claude-store.ts)

## Overview
- **Priority:** High
- **Status:** Pending
- Intercept `/` prefix in input, show autocomplete, handle local vs CLI commands

## Key Insights
- **ALL slash commands are interactive-mode only.** Passing `/plan` via `-p` sends it literally to the LLM — it does NOT invoke the skill system.
- Every command must be implemented client-side or mapped to CLI flags
- Full command list: `/clear`, `/compact`, `/config`, `/cost`, `/diff`, `/help`, `/model`, `/plan`, `/resume`, `/skills`, `/stats`, `/usage`, and 30+ more
- Skills like `/cook`, `/fix` are also interactive-only — for `-p` mode, just send the task description as a regular prompt (Claude Code agent handles it the same way via CLAUDE.md rules)

## Requirements

### Functional
- When user types `/`, show dropdown with available commands
- Filter dropdown as user types (fuzzy match)
- Commands categorized: Built-in (local) vs Skills (sent to CLI)
- Enter or click selects command, fills input
- Local commands execute immediately without CLI call
- Escape dismisses dropdown

### Non-functional
- Dropdown renders < 16ms (no heavy computation)
- Keyboard navigable (arrow keys + enter)

## Architecture

```
User types "/" in input
  ↓
ClaudeInput detects "/" prefix
  ↓
Show SlashCommandDropdown component
  ↓
User selects command
  ↓
Local command? → Execute locally (clear messages, show cost, etc.)
CLI command? → Pass full text to sendMessage() as normal prompt
```

## Command Registry

### Local Commands (handled in frontend)
| Command | Action |
|---------|--------|
| `/clear` | Reset messages array in claude-store |
| `/cost` | Display accumulated cost from result events |
| `/help` | Show help panel with available commands |
| `/new` | Start new session (clear messages + session ID) |

### Mapped Commands (converted to CLI flags or special behavior)
| Command | Client-side action |
|---------|-------------------|
| `/model <name>` | Set `--model <name>` flag on next CLI invocation |
| `/compact` | Send `"Summarize conversation so far briefly"` with `--resume` |
| `/plan` | Set `--permission-mode plan` flag (read-only mode) |
| `/resume` | Load previous session ID, use `--resume` flag |

### Skill-like Commands (sent as regular prompt text)
Skills like `/cook`, `/fix`, `/plan` don't work via `-p` mode. Instead, strip the `/` prefix and send as a regular message. Claude Code agent handles the task via CLAUDE.md rules anyway.
- `/fix the auth bug` → send `"fix the auth bug"` as prompt
- `/commit` → send `"commit the changes"` as prompt

## Related Code Files

### Modify
- `src/components/claude-input.tsx` — Add `/` detection, dropdown trigger
- `src/stores/claude-store.ts` — Add `clearMessages`, `getAccumulatedCost` actions

### Create
- `src/components/slash-command-dropdown.tsx` — Autocomplete dropdown component
- `src/data/slash-commands.ts` — Command registry (static list + types)

## Implementation Steps

1. Create `src/data/slash-commands.ts` with command definitions
   - Define `SlashCommand` interface: `{ name, description, category, isLocal }`
   - Export static array of known commands
   - Export filter function for fuzzy matching

2. Create `src/components/slash-command-dropdown.tsx`
   - Positioned above input (absolute/portal)
   - Accepts `query` string, filters commands
   - Arrow key navigation, Enter to select
   - Show command name + short description
   - Category badges (Built-in / Skill)

3. Update `src/components/claude-input.tsx`
   - Track if input starts with `/` and show dropdown
   - On command select: if local → execute, if CLI → fill input
   - Handle Escape to dismiss dropdown
   - Handle arrow keys when dropdown is open

4. Update `src/stores/claude-store.ts`
   - Add `clearMessages(paneId)` action
   - Add `newSession(paneId)` action (clear + reset sessionId)
   - Track `totalCostUsd` per pane from result events

## Todo List
- [ ] Create slash command data registry
- [ ] Create dropdown component
- [ ] Update claude-input with `/` detection
- [ ] Add local command handlers to store
- [ ] Test keyboard navigation

## Success Criteria
- Typing `/` shows dropdown within 1 frame
- Arrow keys navigate, Enter selects
- `/clear` resets conversation locally
- `/plan some task` sends to Claude CLI correctly
- Escape dismisses dropdown

## Risk Assessment
- **Low risk:** Additive feature, no breaking changes
- **Edge case:** User pastes text starting with `/` — should still show dropdown
- **Edge case:** Empty `/` followed by space — dismiss dropdown
