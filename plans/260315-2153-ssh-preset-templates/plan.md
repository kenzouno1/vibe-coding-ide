# SSH Preset vs Session Separation (MobaXterm-style)

## Overview
Separate SSH presets (templates) from sessions (saved server connections). Presets = reusable config without host. Sessions = persisted server profiles referencing a preset.

## Architecture

```
Preset (template)          Session (saved server)
├── id                     ├── id
├── name                   ├── name
├── port                   ├── host
├── username               ├── preset_id (optional)
├── auth_method            ├── port (override)
├── private_key_path       ├── username (override)
└── startup_cmd            ├── auth_method (override)
                           ├── private_key_path (override)
                           └── startup_cmd (override)
```

Session stores full config (resolved from preset + overrides). If preset_id set, UI shows "from preset X". Editing preset doesn't auto-change existing sessions.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | Backend: new types + storage | pending | M |
| 2 | Frontend: types + store refactor | pending | M |
| 3 | Frontend: UI separation (preset mgr + session mgr) | pending | L |
| 4 | Migration: existing presets → sessions | pending | S |

## Phase 1: Backend — Types + Storage (Rust)

**Files:** `src-tauri/src/ssh_presets.rs`

- Rename file to `ssh_presets.rs` (keep, handles both presets + sessions)
- Add `startup_cmd: Option<String>` to `SshPreset`
- Remove `host` from `SshPreset`
- New `SshSavedSession` struct: `id, name, host, preset_id: Option<String>, port, username, auth_method, private_key_path, startup_cmd`
- Separate storage files: `~/.devtools/ssh-presets.json`, `~/.devtools/ssh-sessions.json`
- CRUD commands: `ssh_session_list`, `ssh_session_save`, `ssh_session_delete`
- Register new commands in `lib.rs`

## Phase 2: Frontend — Types + Store

**Files:** `src/stores/ssh-types.ts`, `src/stores/ssh-store.ts`

- Update `SshPreset` type: remove `host`, add `startup_cmd`
- New `SshSavedSession` type: `id, name, host, preset_id?, port, username, auth_method, private_key_path?, startup_cmd?`
- Add to store: `sessions: SshSavedSession[]`, `loadSessions()`, `saveSession()`, `deleteSession()`
- Update `connect()` to accept `SshSavedSession` instead of `SshPreset`

## Phase 3: Frontend — UI Separation

**Files:** `ssh-preset-manager.tsx`, `ssh-preset-form.tsx` (update), new `ssh-session-manager.tsx`, `ssh-session-form.tsx`

### Preset Manager (template CRUD)
- List presets with name, port, user, auth info (no host)
- Edit/Delete buttons
- "New Preset" button

### Session Manager (server list — main view)
- List saved sessions: name, user@host:port, preset badge
- Connect/Edit/Duplicate/Delete buttons
- "New Session" button → opens session form
- Active connections section (existing)

### Session Form
- "Use preset" dropdown at top → fills defaults
- Fields: Name, Host (required), Port, Username, Auth, Key, Startup cmd
- When preset selected: show which fields are from preset vs overridden

### Navigation
- SSH panel default view = Session Manager
- Preset Manager accessible via gear/settings icon in header

## Phase 4: Migration

- On first load, if `ssh-presets.json` exists but `ssh-sessions.json` doesn't:
  - Convert each old preset (which had host) into a session
  - No presets created (user creates templates manually)

## Out of Scope
- Folder organization for sessions
- Session groups/tags
- Import/export

## Risk
- Low. Mostly additive. Migration handles backward compat.
