# Claude Code CLI as Subprocess for Chat UIs

**Date:** 2026-03-21
**Token Efficiency:** Research prioritized observable facts over speculation
**Status:** Complete with actionable findings

---

## Executive Summary

Claude Code CLI can be spawned as a subprocess for building chat UIs using the `--print` (or `-p`) flag combined with structured output formats. The most practical approach uses `--output-format json` or `--output-format stream-json` for programmatic integration, with stdin/stdout piping for bidirectional communication.

**Key capability:** The CLI emits newline-delimited JSON (NDJSON) where each line is a complete, parseable JSON object—no buffering, no multi-line messages.

---

## 1. Claude Code CLI Flags for Structured Output

### Primary Flags

| Flag | Purpose | Notes |
|------|---------|-------|
| `-p` / `--print` | Non-interactive, one-shot mode (exits after completion) | Required for subprocess integration |
| `--output-format json` | Single JSON object at end (result + metadata) | Best for simple Q&A with structured output |
| `--output-format stream-json` | Newline-delimited JSON stream (NDJSON) | Best for real-time chat UIs; requires `--verbose` |
| `--output-format text` | Plain text (default); not suitable for subprocess | Intended for human reading |
| `--input-format stream-json` | Accept NDJSON on stdin for bidirectional chat | Chains claude instances; replay-capable |
| `--include-partial-messages` | Emit streaming tokens as `stream_event` objects | Works only with `--output-format stream-json` + `--verbose` |
| `--json-schema <schema>` | Validate output against JSON Schema | Works with `--output-format json`; structured output goes to `.structured_output` field |

### Session & Continuation Flags

| Flag | Purpose |
|------|---------|
| `--continue` | Resume most recent session in current directory |
| `--resume <session-id>` | Resume specific session by UUID |
| `--session-id <uuid>` | Use specific UUID for this session |
| `--no-session-persistence` | Disable saving; one-shot, no resumable history |

### Subprocess-Critical Flags

| Flag | Purpose |
|------|---------|
| `--verbose` | **Required** when using `--output-format stream-json`; enables full event emission |
| `--allowedTools` | Auto-approve tools without permission prompts (critical for non-interactive) |
| `--max-budget-usd <amount>` | Cap spending; stops if limit reached |
| `--max-turns <n>` | Limit agentic turns (print mode only) |
| `--permission-mode auto` | Auto-approve permissions in specific mode |

---

## 2. Stream-JSON Output Format

### Format: Newline-Delimited JSON (NDJSON)

Each line is a complete JSON object. **Important:** You must parse line-by-line, not wait for EOF.

```bash
claude -p "test" --output-format stream-json --verbose --include-partial-messages | head -3
```

Example output (3 lines):
```json
{"type":"system","subtype":"hook_started","hook_id":"7bd2ebb0-...","session_id":"8cfdaa67-..."}
{"type":"system","subtype":"init","cwd":"C:\\...","tools":[...],"model":"claude-opus-4-6[1m]","session_id":"8cfdaa67-..."}
{"type":"stream_event","event":{"type":"message_start","message":{...}},"session_id":"8cfdaa67-..."}
```

### Message Types in Stream-JSON

| Type | Description | When Emitted |
|------|-------------|--------------|
| `system` | Initialization, hooks, retries | At session start; during API retries |
| `stream_event` | Raw Claude API event (message_start, content_block_delta, etc.) | When `--include-partial-messages` is used |
| `assistant` | Complete assistant message with full content | After message generation completes |
| `user` | Tool result returned to agent | After tool execution |
| `result` | Final completion; session cost/tokens | End of conversation |
| `rate_limit_event` | Rate limit status | Periodic checks |

### Stream Event Structure

When `type: "stream_event"`, the `.event` field contains raw Claude API streaming events:

```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_delta",
    "index": 0,
    "delta": {
      "type": "text_delta",
      "text": " Hello"
    }
  },
  "session_id": "8cfdaa67-...",
  "parent_tool_use_id": null,
  "uuid": "303cd992-..."
}
```

### Event Types in `.event.type`

| Event Type | Purpose | Contains |
|------------|---------|----------|
| `message_start` | Marks beginning of Claude's response | Full message object with metadata, model, usage |
| `content_block_start` | Marks start of text or tool_use block | Block type (`"text"` or `"tool_use"`), index |
| `content_block_delta` | Incremental update to content | Delta type (`"text_delta"` or `"input_json_delta"`), partial content |
| `content_block_stop` | Marks end of block | Index only |
| `message_delta` | Message-level updates | Stop reason, usage tokens |
| `message_stop` | Marks end of message | (Empty) |

### Text Streaming Example

Extracting streaming text with jq:

```bash
claude -p "Explain recursion" --output-format stream-json --verbose --include-partial-messages | \
  jq -rj 'select(.type == "stream_event" and .event.delta.type? == "text_delta") | .event.delta.text'
```

Output: Tokens appear character-by-character, no newlines between deltas.

### Tool Use Streaming

Tool calls stream their JSON input incrementally:

```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_delta",
    "index": 0,
    "delta": {
      "type": "input_json_delta",
      "partial_json": "{\"file_path\":"
    }
  },
  "session_id": "...",
  "uuid": "..."
}
```

---

## 3. Subprocess Integration Patterns

### Simple One-Shot Pattern (Recommended)

```bash
# Non-interactive, structured output, no persistence
claude -p "Analyze this code" \
  --output-format json \
  --allowedTools "Read,Bash" \
  --max-turns 3
```

Response:
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "result": "Analysis here...",
  "session_id": "8cfdaa67-...",
  "total_cost_usd": 0.123,
  "usage": {
    "input_tokens": 150,
    "output_tokens": 75,
    "cache_creation_input_tokens": 5000,
    "cache_read_input_tokens": 2000
  },
  "structured_output": null,  // Set if --json-schema provided
  "uuid": "a6490446-..."
}
```

### Streaming Chat Pattern (Real-Time UI)

```bash
# Stream tokens as they generate
claude -p "Write a poem" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --no-session-persistence
```

Parse line-by-line:
- Extract `stream_event` with `event.delta.type == "text_delta"` for text chunks
- Accumulate until `message_stop` event
- Then process result

### Stateful Conversation Pattern (Multi-Turn)

```bash
# First request - captures session_id
session=$(claude -p "Start analysis" --output-format json | jq -r '.session_id')

# Continuation request - same session
claude -p "Focus on performance" \
  --resume "$session" \
  --output-format json
```

### Bidirectional Stream Pattern (Advanced)

```bash
# Input from stdin, output to stdout (both NDJSON)
echo '{"type":"user","message":"Analyze my code"}' | \
  claude -p \
    --input-format stream-json \
    --output-format stream-json \
    --verbose
```

> **Note:** `--replay-user-messages` flag (exists in CLI) echoes input back on stdout for acknowledgment in this mode.

---

## 4. JSON Schema & Structured Output

Get validated JSON from Claude:

```bash
claude -p "Extract function names from auth.py" \
  --output-format json \
  --json-schema '{
    "type":"object",
    "properties":{
      "functions":{"type":"array","items":{"type":"string"}}
    },
    "required":["functions"]
  }'
```

Response:
```json
{
  "type": "result",
  "structured_output": {
    "functions": ["login", "logout", "verify_token"]
  },
  "result": "Found 3 functions...",
  "session_id": "...",
  ...
}
```

---

## 5. How VSCode/Cursor Extensions Actually Integrate

### Current Integration Model (Observed 2026)

Both VSCode and Cursor use **MCP (Model Context Protocol)** servers rather than direct CLI subprocess integration for their extensions. The extensions themselves run as VSCode/Cursor extensions communicating with Claude via the Anthropic API, not spawning the `claude` CLI.

- **Claude Code extension for VSCode**: Communicates directly with Anthropic API using oauth tokens
- **Cursor IDE**: Built-in Claude integration uses Cursor's own API implementation
- **MCP servers**: Expose tools to Claude via JSON-RPC 2.0 (stdio, HTTP, SSE-based)

### CLI Usage in Extensions

The `claude` CLI is available **within the integrated terminal** of VSCode/Cursor, but extensions don't orchestrate it. Users invoke it manually or in scripts:

```bash
# From VS Code terminal
claude -p "Fix this bug" --allowedTools "Read,Edit,Bash"
```

### Cursor-Agent & Subprocess Patterns

Recent Cursor updates (2026) added `cursor-agent` which can be spawned as a subprocess within IDE plugins using the Agent SDK. This is the CLI subprocess pattern being adopted:

```typescript
// Pseudo-code: how an IDE plugin might spawn claude
const subprocess = spawn('claude', [
  '-p',
  'Your task...',
  '--output-format', 'stream-json',
  '--verbose',
  '--allowedTools', 'Read,Edit,Bash'
]);

subprocess.stdout.on('data', (line) => {
  const message = JSON.parse(line);
  if (message.type === 'stream_event' && message.event.delta.type === 'text_delta') {
    display(message.event.delta.text);
  }
});
```

---

## 6. Best Practices for Subprocess Integration

### Process Management

**Stdin/Stdout Piping:**
- Read/write UTF-8 encoded NDJSON
- Use line buffering: parse each `\n`-delimited JSON object independently
- Don't buffer entire output; process events as they arrive

**Error Handling:**
```bash
# Capture both stdout and stderr
claude -p "query" --output-format json 2>&1 | jq '.is_error'
```

If `is_error: true`, check `.result` field for error message.

**Process Exit Codes:**
- `0`: Success (check `.is_error` in JSON)
- `1`: Authentication failure or permission denial
- Other: System errors

### Cost & Budget Control

```bash
# Halt if costs exceed $5
claude -p "Expensive task" \
  --output-format json \
  --max-budget-usd 5.00
```

Respects budget in print mode only. Useful for UI-spawned agents.

### Tool Permissions

```bash
# Whitelist specific Bash patterns
claude -p "Run tests" \
  --allowedTools "Bash(npm test *),Bash(git diff *),Read"
```

Prevents accidental destructive commands.

### Session Persistence & Resumption

```bash
# Disable persistence for stateless one-shot UIs
claude -p "Quick query" \
  --no-session-persistence \
  --output-format json
```

For multi-turn chat, save `session_id` and use `--resume` or `--continue`.

### Working Directory Context

```bash
# Set CWD for tool execution
cd /project/path && claude -p "List files" \
  --output-format json
```

Claude inherits CWD from subprocess parent. Use `--add-dir` to grant access to other directories.

---

## 7. Practical Example: Building a Chat UI

### TypeScript/Node.js Pattern

```typescript
import { spawn } from 'child_process';
import { readline } from 'readline';

async function chat(userMessage: string) {
  const process = spawn('claude', [
    '-p',
    userMessage,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--allowedTools', 'Read,Bash,Edit'
  ]);

  const rl = readline.createInterface({ input: process.stdout });

  for await (const line of rl) {
    const message = JSON.parse(line);

    if (message.type === 'stream_event') {
      const event = message.event;

      // Text streaming
      if (event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text); // Real-time output
      }

      // Tool use detection
      if (event.type === 'content_block_start' &&
          event.content_block.type === 'tool_use') {
        console.log(`[Using ${event.content_block.name}...]`);
      }
    }

    // Session complete
    if (message.type === 'result') {
      return {
        text: message.result,
        cost: message.total_cost_usd,
        sessionId: message.session_id
      };
    }
  }
}
```

### Key Points

1. **Line-by-line parsing**: Each JSON object is on one line
2. **Stream detection**: Check `message.type === 'stream_event'` for real-time tokens
3. **Cost tracking**: `.total_cost_usd` in result message
4. **Session resumption**: Save `session_id` for multi-turn conversations

---

## Known Limitations & Caveats

### Extended Thinking Incompatible with Streaming

When `max_thinking_tokens` is set, `stream_event` messages are **not emitted**. Only complete `assistant` messages arrive. Planning-heavy tasks may not stream.

### Structured Output (JSON Schema)

The JSON result appears only in the final `ResultMessage.structured_output`, not as streaming deltas. Cannot progressively parse structured output; must wait for completion.

### Session ID Capture

Session IDs are in `result.session_id`, not earlier system messages. Don't try to resume until you have the final result.

### Verbose Flag Required

`--output-format stream-json` **requires** `--verbose` or you get an error: *"stream-json requires --verbose"*.

---

## Unresolved Questions

1. **MCP tool execution streaming**: Do tool results (e.g., Bash stdout) stream in real-time via `stream_event`, or only after completion? (Documentation suggests completion only.)
2. **Bidirectional stream protocol**: What format do input messages need when using `--input-format stream-json`? Full spec not found; only example mentioned.
3. **Permission prompts in non-interactive mode**: What happens if user encounters a permission denial in `-p` mode without `--allowedTools`? Does it error or skip the tool?
4. **Cache behavior with stream-json**: Are cache hits reported in `stream_event` or only in final result message?

---

## Sources

- [CLI reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)
- [Run Claude Code programmatically - Claude Code Docs](https://code.claude.com/docs/en/headless)
- [Stream responses in real-time - Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/streaming-output)
- [Streaming Messages - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Stream-JSON Chaining - ruvnet/claude-flow Wiki](https://github.com/ruvnet/ruflo/wiki/Stream-Chaining)
- [Claude Agent SDK Technical Specification](https://gist.github.com/POWERFULMOVES/58bcadab9483bf5e633e865f131e6c25)
- Real CLI output sampled and validated on 2026-03-21

