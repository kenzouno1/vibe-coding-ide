# agent-remote: Comprehensive Analysis

**Repo:** https://github.com/haidang1810/agent-remote
**Date:** 2026-03-21
**Author:** researcher agent

---

## 1. Project Architecture

### Overview
Self-hosted MCP (Model Context Protocol) gateway for VPS. Acts as a bridge: AI clients (Claude Code, Cursor) connect via MCP over HTTP, and the server executes privileged operations on the host machine.

### Tech Stack
| Layer | Choice |
|-------|--------|
| Runtime | Node.js (ESM, TypeScript compiled via tsx/tsc) |
| HTTP Server | Fastify 5 |
| DB | SQLite via `better-sqlite3` |
| Auth | bcrypt (admin) + SHA-256 hashed API keys + JWT |
| MCP | `@modelcontextprotocol/sdk` Streamable HTTP transport |
| Realtime | `@fastify/websocket` (ws) |
| Frontend | React 18 + Vite 5 (SPA served as static files) |
| Deploy | PM2 fork mode (single process) |

### Directory Structure
```
src/
├── server.ts              # Bootstrap: registers all plugins + routes
├── config.ts              # Env-based config (PORT, JWT_SECRET, ALLOWED_PATHS, etc.)
├── auth/
│   ├── admin-auth.ts      # bcrypt admin password (hashed in SQLite settings)
│   ├── api-key-auth.ts    # SHA-256 key validation + expiry + touchUsage
│   └── permission-checker.ts  # Per-key, per-tool permission gate
├── mcp/
│   ├── mcp-server.ts      # POST/GET/DELETE /mcp routes + per-request McpServer creation
│   ├── session-manager.ts # 30-min idle session cleanup
│   └── tool-registry.ts   # Global tool list + permission-filtered registration + audit
├── tools/
│   ├── _shared/
│   │   ├── path-whitelist.ts   # Filesystem access control (whitelist + blocklist)
│   │   ├── exec-wrapper.ts     # safeExec: 30s timeout, 100KB output cap, name validation
│   │   └── tool-helpers.ts     # textResult/errorResult helpers
│   ├── filesystem/         # 7 tools (read, write, delete, grep, search, stat, list)
│   ├── system/             # 5 tools (info, disk, memory, processes, ports)
│   ├── docker/             # 7 tools + 3 compose
│   ├── service/            # 5 systemd tools
│   ├── logs/               # 3 tools (journald, file tail, pm2 logs)
│   ├── network/            # 4 tools
│   ├── git/                # 3 tools
│   ├── pm2/                # 4 tools
│   ├── nginx/              # 3 tools
│   ├── cron/               # 3 tools
│   ├── ssl/                # 2 tools
│   └── package/            # 2 tools
├── api/                    # Dashboard REST routes (JWT-protected)
├── db/                     # SQLite models + migrations
├── plugins/                # Fastify plugins (cors, rate-limit, jwt, websocket, static)
└── ws/                     # WebSocket broadcast manager + system metrics emitter
web/                        # React SPA dashboard
```

---

## 2. AI Agent Skills/Commands (51 Tools)

### System (5) — all `low` risk
`system_info`, `system_disk_usage`, `system_memory_detail`, `process_list`, `port_list`

### Filesystem (7)
| Tool | Risk |
|------|------|
| `file_read`, `file_stat`, `file_search`, `file_grep`, `directory_list` | low |
| `file_write` | high |
| `file_delete` | high |

### Logs (3) — `medium` risk
`log_journald`, `log_file`, `log_pm2`

### Docker (7)
| Tool | Risk |
|------|------|
| `docker_container_list`, `docker_container_inspect`, `docker_container_stats` | low |
| `docker_container_logs` | medium |
| `docker_container_start`, `docker_container_stop`, `docker_container_restart` | high |

### Docker Compose (3)
| Tool | Risk |
|------|------|
| `docker_compose_list` | low |
| `docker_compose_up`, `docker_compose_down` | high |

### Service/Systemd (5)
| Tool | Risk |
|------|------|
| `service_status`, `service_list` | low |
| `service_start`, `service_stop`, `service_restart` | **critical** |

### Network (4)
| Tool | Risk |
|------|------|
| `network_ping`, `network_dns_lookup`, `network_check_port` | low |
| `network_firewall_rules` | medium |

### Package (2) — `low`
`package_list`, `package_check_updates`

### SSL/TLS (2) — `low`
`ssl_cert_info`, `ssl_cert_expiry`

### Git (3)
| Tool | Risk |
|------|------|
| `git_status`, `git_log` | low |
| `git_pull` | high |

### Cron (3)
| Tool | Risk |
|------|------|
| `cron_list` | low |
| `cron_add`, `cron_remove` | **critical** |

### PM2 (4)
| Tool | Risk |
|------|------|
| `pm2_list` | low |
| `pm2_start`, `pm2_stop`, `pm2_restart` | high |

### Nginx (3) — all `low`
`nginx_list_sites`, `nginx_test_config`, `nginx_site_config`

---

## 3. Security Model

### Authentication (two-plane)

**Admin plane (dashboard):**
- Single admin account; password hashed with bcrypt (12 rounds), stored in SQLite `settings` table
- Login via `POST /api/auth/login` (rate-limited to 5 req/min) → returns JWT (24h expiry)
- JWT secret auto-generated (32-byte random hex) on first boot if env default unchanged
- Dashboard WebSocket auth via JWT token in query string `?token=`

**MCP plane (AI clients):**
- API keys: `ar_k_` prefixed, 16-byte random hex; stored as SHA-256 hash only
- Passed via `x-api-key` header or `Authorization: Bearer ar_k_*`
- Keys have: `active` flag, optional `expires_at` (unix timestamp), per-key `rate_limit` field (stored but see §7)
- `last_used_at` updated on each valid request (`touchKeyUsage`)

### Authorization Flow (MCP tool calls)
```
Request → extractApiKey → validateApiKey (hash lookup + expiry)
       → registerToolsForKey (filter by canExecuteTool at registration)
       → executeToolWithAudit (re-checks canExecuteTool at execution time)
```

Permission check order in `canExecuteTool`:
1. Tool must exist in DB and be globally enabled
2. Key must be active + not expired
3. Explicit per-key permission override (allow or deny) takes precedence
4. Default: allowed (no explicit record = allow)

### Filesystem Sandboxing
`path-whitelist.ts` enforces two layers:

**Hard blocklist (always denied regardless of whitelist):**
- `/etc/shadow`, `/etc/sudoers`, `/etc/gshadow`
- `.ssh/id_rsa`, `.ssh/id_ed25519`, `.ssh/authorized_keys`
- `.env`, `.env.local`, `.env.production`

**Whitelist (configurable via dashboard, no restart needed):**
- Default: `/home:/var/www:/var/log:/opt:/etc/nginx:/tmp:/srv`
- Path traversal (`..`) explicitly rejected

**Note:** Blocklist checks use `absolute.endsWith(blocked)` + `includes('/${blocked}')` — string-based, not symlink-aware.

### Execution Safety
`exec-wrapper.ts`:
- Shell commands wrapped with 30s timeout (hard cap 120s)
- Output capped at 100KB
- Service/process names validated via `isValidName` regex: `^[\w@.-]+$`, max 128 chars
- Uses `sudo systemctl` for service start/stop/restart (requires sudoers config on host)

---

## 4. Agent-Server Communication Protocol

### MCP over Streamable HTTP
- Endpoint: `POST /mcp` (tool calls + initialize), `GET /mcp` (SSE stream), `DELETE /mcp` (session end)
- Transport: `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`
- Each new session: a fresh `McpServer` instance is created with only permitted tools registered
- Session identified by `mcp-session-id` header (UUID)
- Sessions expire after 30 min idle; cleanup runs every 5 min

### Session Lifecycle
```
POST /mcp (no session-id) → validate key → create McpServer → register tools → connect transport → respond
POST /mcp (with session-id) → lookup session → forward to existing transport
GET  /mcp (with session-id) → SSE stream for server-initiated messages
DELETE /mcp → destroy session
```

### Dashboard WebSocket (`/ws`)
- JWT token passed as query param
- Pub/sub model: client sends `{ type: "subscribe", channel: "logs"|"system" }`
- `logs` channel: real-time audit log broadcasts after each tool execution
- `system` channel: CPU/memory/uptime metrics emitted every 5s (only when subscribers present)
- Message format: `{ type: channel, data: {...} }`

### REST API (dashboard, JWT-protected)
- `GET/POST /api/auth/*` — login, setup, change-password
- `GET/POST /api/keys` — API key CRUD
- `GET/PATCH /api/tools` — global tool enable/disable
- `GET /api/logs` — audit log query
- `GET /api/system` — live system stats
- `GET /api/overview` — summary dashboard data

---

## 5. CLAUDE.md / Agent Instructions

The project ships both `CLAUDE.md` (for Claude Code) and `AGENTS.md` (for OpenCode):

**CLAUDE.md key instructions:**
- Delegates to subagents; reads `./README.md` before implementation
- References local rule files in `.claude/rules/` (primary-workflow, development-rules, etc.)
- Defines a "Privacy Block Hook" (`@@PRIVACY_PROMPT@@`) flow — uses `AskUserQuestion` tool before reading sensitive files
- Instructs: files over 200 lines → modularize; use kebab-case file names; use `.venv` Python for scripts

**AGENTS.md** — mirrors CLAUDE.md for OpenCode compatibility; references `opencode.json` for instructions loading. Generated by "ClaudeKit OpenCode Generator."

**Key note:** These files instruct the *development AI* working on the agent-remote codebase, not the AI connecting as a VPS management client. The VPS-controlling AI simply uses MCP tools; the tool descriptions and schema are the only "instructions" it receives.

---

## 6. Permission System

### Three-tier permission architecture

**Tier 1 — Global tool toggle** (admin dashboard)
Each of the 51 tools has a `enabled` flag in the `tools` table. Globally disabled tools are unavailable to all keys.

**Tier 2 — Per-key tool permissions** (`api_key_permissions` table)
Each key can have explicit allow/deny overrides per tool. No record = default allow. Dashboard UI lets admin toggle per-tool per-key.

**Tier 3 — Runtime parameter validation**
- Filesystem tools: `isPathAllowed()` whitelist/blocklist
- Service/exec tools: `isValidName()` regex validation
- Permission re-checked at execution time (not just registration) — prevents TOCTOU if permissions change mid-session

### DB Schema highlights
```sql
api_keys       -- id, name, key_hash, active, expires_at, rate_limit
api_key_permissions -- api_key_id, tool_name, allowed  (explicit override)
tools          -- name, category, risk_level, enabled, call_count
audit_logs     -- tool_name, status, params, result, duration_ms, ip_address
```

---

## 7. Notable Patterns

### Audit Logging (comprehensive)
Every tool call logged: `api_key_id`, `api_key_name`, `tool_name`, `status` (success/error/denied/timeout), `params` (full JSON), `result` (truncated to 10KB), `duration_ms`, `ip_address`. Denied executions also logged. Logs auto-cleanup after 30 days. Live-streamed to dashboard via WebSocket.

### Rate Limiting
- Global: 100 req/min via `@fastify/rate-limit` (applied to all routes)
- Login: tightened to 5 req/min on `POST /api/auth/login`
- API keys have a `rate_limit` column (default 60) but **no enforcement code found** — field exists in schema but not wired to actual throttling per key. Likely a planned/incomplete feature.

### Session isolation
Each MCP session gets a fresh `McpServer` instance with only the requesting key's permitted tools registered. This means a compromised session can only access what the key is permitted; it cannot enumerate other tools.

### Tool call counting
`call_count` incremented in `tools` table on successful execution — supports analytics/monitoring.

### Risk taxonomy
Tools are classified `low/medium/high/critical` (stored in DB, visible in dashboard). Used for display/awareness only — no automatic blocking based on risk level.

### Broadcast on audit
`insertAuditLog` directly calls `broadcastManager.broadcast('logs', ...)` — tight coupling but simple; no message queue needed given single-process design.

### Auto-seeding
Admin password + JWT secret both auto-generate from env on first boot if defaults detected. JWT secret falls back to random 32-byte hex stored in SQLite if env default unchanged.

### No shell injection defense beyond name validation
`safeExec` passes commands directly to `exec()`. Safety relies on `isValidName` for user-controlled string interpolation. Fine for service names but worth noting there's no shell escaping library (e.g., `shell-quote`).

---

## Unresolved Questions

1. **Per-key rate limiting not implemented** — `rate_limit` column exists in `api_keys` schema but no enforcement found. Is this intentional (future work) or a bug?
2. **`sudo systemctl` assumption** — service start/stop/restart use `sudo`. No documentation on required sudoers config. If not configured, these tools silently fail or error.
3. **Symlink traversal** — path blocklist uses string matching, not `realpath`. A symlink outside the blocklist pointing to `/etc/shadow` would bypass the check.
4. **No TLS at application level** — README recommends Nginx/Cloudflare Tunnel for HTTPS. Running directly on HTTP exposes API keys in transit.
5. **WebSocket token in query string** — JWT passed as `?token=` query param; may appear in server logs/nginx access logs.
6. **No input size limits** — `file_write` content parameter has no max size enforced; large writes limited only by OS/disk.
7. **MCP session stored in memory only** — server restart loses all active sessions; clients must reconnect. Acceptable for stateless tool calls but worth noting.
