# Claude Code CLI — Full Feature Support in Custom Chat UI

**Date:** 2026-03-21
**Context:** Tauri v2 desktop app, currently using `claude -p "<msg>" --output-format stream-json --verbose`

---

## 1. Slash Commands

### Which exist
Full list of built-in commands: `/add-dir`, `/agents`, `/btw`, `/clear` (aliases: `/reset`, `/new`), `/compact [instructions]`, `/config`, `/context`, `/copy`, `/cost`, `/diff`, `/effort`, `/exit`, `/export`, `/branch`, `/help`, `/hooks`, `/ide`, `/init`, `/insights`, `/mcp`, `/memory`, `/model`, `/permissions`, `/plan`, `/plugin`, `/pr-comments`, `/rename`, `/resume`, `/rewind`, `/sandbox`, `/security-review`, `/skills`, `/stats`, `/tasks`, `/theme`, `/usage`, `/vim`, `/voice`, plus bundled skills like `/simplify`, `/batch`, `/debug`.

MCP servers can expose prompts as `/mcp__<server>__<prompt>` commands.

### Print mode vs interactive mode
**CRITICAL:** Slash commands are **interactive-mode only**. They are processed by the CLI's REPL input handler, not the agent.

In `-p` mode, passing `/clear` as the prompt text sends it literally to the LLM as a user message — it does **not** execute the command. There is no flag to invoke slash commands in print mode.

**Workaround for UI:** Implement slash commands client-side in your UI:
- `/clear` → discard session, start fresh (clear UI + don't pass `--resume`)
- `/compact` → send a system-level prompt: `"Summarize the conversation so far briefly, then continue"` with `--resume`
- `/model` → switch model via `--model` flag on next invocation
- `/cost` → parse `total_cost_usd` from the `result` message
- `/plan` → use `--permission-mode plan` flag
- `/help` → render static command list in UI

**`--disable-slash-commands`** flag exists to suppress all skills/commands in interactive sessions (not relevant for `-p` mode).

---

## 2. Image / File Input

### In interactive mode
Images work via: Ctrl+V (paste from clipboard), drag-and-drop, `@filepath` mentions. These are **keyboard/terminal interactive features only**.

### In print mode (`-p`)
No `--input-files` flag exists in the current CLI. Image input in `-p` mode is achieved via `--input-format stream-json` with `SDKUserMessage`.

**`SDKUserMessage` type** (from Agent SDK):
```typescript
type SDKUserMessage = {
  type: "user";
  message: MessageParam; // Anthropic SDK MessageParam — supports multimodal content
  session_id: string;
  parent_tool_use_id: string | null;
};
```

`MessageParam.content` can be an array including `{ type: "image", source: { type: "base64", media_type: "image/png", data: "<base64>" } }`.

### Practical pattern for Tauri
1. User pastes image → Rust captures clipboard PNG bytes
2. Base64-encode the bytes
3. Construct NDJSON `SDKUserMessage` with image content block
4. Pipe to `claude -p --input-format stream-json --output-format stream-json --verbose` via stdin

```bash
# stdin line:
{"type":"user","message":{"role":"user","content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"<b64>"}},{"type":"text","text":"What is in this screenshot?"}]},"session_id":"<id>","parent_tool_use_id":null}
```

**Simpler alternative:** Write image to temp file, include file path in message text — Claude Code's `Read` tool handles images natively (PNG, JPEG, GIF, WEBP, PDF, Jupyter).

---

## 3. Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)

### What it is
The Claude Code SDK was renamed to **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`). It's the same engine that powers the `claude` CLI, exposed as a Node.js/Python library.

```bash
npm install @anthropic-ai/claude-agent-sdk
```

### Key API
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const msg of query({
  prompt: "Fix the bug in auth.ts",
  options: {
    cwd: "/path/to/project",
    allowedTools: ["Read", "Edit", "Bash"],
    permissionMode: "acceptEdits",
    mcpServers: { playwright: { command: "npx", args: ["@playwright/mcp@latest"] } },
    resume: "session-uuid",
  }
})) { ... }
```

### Relevance to Tauri
The SDK runs in Node.js and **cannot be directly embedded in a Tauri Rust process**. Options:
1. **Keep current approach** (spawn `claude` CLI subprocess from Rust) — already works
2. **Sidecar Node.js process**: Tauri sidecar runs a Node.js script using the Agent SDK, communicates with Rust via IPC/stdio
3. **Not recommended**: The SDK is essentially a wrapper that spawns the same `claude` CLI subprocess anyway — no net benefit over current approach unless you need hooks or SDK-only features

### SDK-only features not in CLI `-p` mode
- **`query.supportedCommands()`** — programmatically list available slash commands
- **`query.setPermissionMode()`** / **`query.setModel()`** — change mid-session without restart
- **`query.rewindFiles()`** — undo file changes to a previous state (requires `enableFileCheckpointing: true`)
- **`query.setMcpServers()`** — dynamically swap MCP servers mid-session
- **`query.streamInput()`** — true multi-turn without process restart (stdin stream)
- **Hooks** (`PreToolUse`, `PostToolUse`, etc.) — intercept/block/transform tool calls programmatically
- **`promptSuggestions`** — next-prompt prediction after each turn
- **`canUseTool` callback** — dynamic per-tool permission function

---

## 4. Interactive vs Print Mode Feature Gap

| Feature | `-p` mode | Interactive mode | Workaround |
|---------|-----------|-----------------|------------|
| Slash commands | No (text-literal only) | Yes | Implement client-side |
| Image paste | Via stdin NDJSON | Ctrl+V | Base64 via stdin or temp file |
| `@file` context pills | No | Yes | Include file path in prompt text |
| `/btw` side questions | No | Yes | Separate `-p` call, no history |
| Session resume | Yes (`--resume`) | Yes (`/resume`) | Already supported |
| `/compact` auto-trigger | No | Yes | Send compaction prompt manually |
| `/rewind` + file undo | No (needs SDK) | Yes | Agent SDK `rewindFiles()` |
| Permission mode toggle | Flag only at start | Shift+Tab mid-session | Kill + restart with new flag |
| Model switch mid-session | No | Yes (`/model`) | Kill + restart with `--model` |
| Background tasks | No | Yes (`Ctrl+B`) | N/A |
| PR status display | No | Yes | Fetch from gh CLI separately |
| Voice input | No | Yes | OS TTS → text → send |
| Prompt suggestions | No (CLI) | Yes | Agent SDK `promptSuggestions: true` |
| Session fork | Via `--fork-session` | `/branch` | Add `--fork-session` flag |
| `/diff` viewer | No | Yes | Show git diff in UI directly |
| `/export` | No | Yes | Call `getSessionMessages()` from SDK |

### Critical gap: true multi-turn without restart
Current impl kills + respawns process per message using `--resume`. This loses any mid-session state changes. Agent SDK's `streamInput()` keeps process alive for true multi-turn — avoids cold startup per message (~200-500ms saved).

---

## 5. Permission Handling in Non-Interactive Mode

### Permission modes (`--permission-mode`)
| Mode | Behavior |
|------|----------|
| `default` | Prompts on first tool use — **BLOCKS in `-p` mode** if no `--allowedTools` |
| `acceptEdits` | Auto-accepts file edits; prompts for Bash |
| `plan` | Read-only analysis — no file writes, no Bash execution |
| `bypassPermissions` | Skips all prompts except protected dirs (.git, .claude, .vscode, .idea) |
| `dontAsk` | Auto-denies unlisted tools |

**Current issue:** If `--allowedTools` or `--permission-mode` not set and Claude tries `Edit`, it will hang waiting for permission in `-p` mode.

### Recommended configuration for chat UI
```rust
cmd.args(&[
    "-p", &message,
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", "acceptEdits",   // auto-accept file edits
    "--allowedTools", "Read,Edit,Write,Bash,Glob,Grep,WebSearch,WebFetch",
    "--max-turns", "10",                   // prevent runaway agents
]);
```

### `--permission-prompt-tool` (advanced)
Pass an MCP tool name to handle permission prompts programmatically:
```
--permission-prompt-tool mcp__my_server__ask_permission
```
The MCP tool receives the permission request JSON and returns allow/deny. Enables interactive permission dialogs in Tauri UI without blocking the subprocess.

### `--dangerously-skip-permissions`
Skips all permission prompts. Only use in sandboxed/containerized environments.

---

## 6. MCP Server Integration

### Via CLI flags (works in `-p` mode)
```bash
claude -p "query" \
  --mcp-config ./mcp.json \
  --output-format stream-json --verbose
```

`mcp.json` format:
```json
{
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] },
    "my-db": { "type": "http", "url": "http://localhost:8080/mcp" }
  }
}
```

Transport types supported: `stdio`, `sse`, `http`.

### Dynamic MCP config per session
Pass JSON string instead of file:
```bash
--mcp-config '{"mcpServers":{"tool":{"command":"my-tool","args":[]}}}'
```

### `--strict-mcp-config`
Ignores all other MCP configs; only uses what's in `--mcp-config`. Good for isolated UI contexts.

### MCP tools as slash commands
When an MCP server exposes prompts, they appear as `/mcp__<server>__<prompt>` — but again, interactive mode only.

### Exposing Tauri UI capabilities to Claude via MCP
Create a local MCP server (stdio transport) that exposes Tauri-specific tools:
- `open_file_in_editor` → calls Tauri command
- `show_notification` → native notification
- `get_clipboard` → clipboard content
- `ask_user` → shows dialog in Tauri window

This is the cleanest way to give Claude access to UI features without modifying the CLI invocation.

---

## Implementation Recommendations (Priority Order)

1. **Add `--permission-mode acceptEdits`** to all invocations — prevents silent hangs
2. **Add `--allowedTools` whitelist** — `Read,Edit,Write,Bash,Glob,Grep`
3. **Add `--max-turns 10`** — prevents runaway agents consuming budget
4. **Client-side slash commands** — intercept `/clear`, `/compact`, `/model`, `/plan` before sending to CLI
5. **Image support** — write clipboard image to temp file, include path in message
6. **Consider Agent SDK sidecar** for: session history API (`listSessions`/`getSessionMessages`), rewind, mid-session model/permission changes
7. **MCP for UI integration** — local stdio MCP server for Tauri-specific capabilities

---

## Unresolved Questions

1. **stdin `SDKUserMessage` with images via CLI**: Confirmed the type supports `MessageParam` (multimodal), but no official docs showing exact NDJSON wire format for image content blocks when piping to `claude -p --input-format stream-json`. Needs empirical test.
2. **Agent SDK in Tauri sidecar**: Would require bundling Node.js runtime in the app or shipping a compiled sidecar. Complexity vs. benefit needs evaluation given current approach already works.
3. **`--permission-prompt-tool` MCP roundtrip latency**: Using an MCP tool for permission prompts adds a JSON-RPC roundtrip. Acceptable for UI dialogs but unknown overhead in practice.
4. **`/compact` equivalent in `-p` mode**: Sending a summarization prompt with `--resume` achieves functional compaction but doesn't reset context window tracking — unclear if this causes issues at token limits.

---

## Sources
- [CLI Reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)
- [Built-in Commands - Claude Code Docs](https://code.claude.com/docs/en/commands)
- [Interactive Mode - Claude Code Docs](https://code.claude.com/docs/en/interactive-mode)
- [Permissions - Claude Code Docs](https://code.claude.com/docs/en/permissions)
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Using Images in Claude Code - amanhimself.dev](https://amanhimself.dev/blog/using-images-in-claude-code/)
