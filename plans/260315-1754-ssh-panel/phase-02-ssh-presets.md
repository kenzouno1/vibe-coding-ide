# Phase 2: SSH Presets Persistence

## Context
- [session_store.rs](../../src-tauri/src/session_store.rs) — reference pattern for JSON persistence to ~/.devtools/
- Phase 1 must be complete (shared SshState)

## Overview
- **Priority:** P1
- **Status:** done
- **Effort:** 1h

## Key Insights
- Same pattern as session_store: read/write JSON to `~/.devtools/ssh-presets.json`
- Presets store connection metadata only — never passwords
- Separate Rust file to keep under 200 lines

## Files to Create
- `src-tauri/src/ssh_presets.rs` (~80 lines)

## Files to Modify
- `src-tauri/src/lib.rs` — add `mod ssh_presets`, register commands

## Data Structure
```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct SshPreset {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String, // "password" | "key"
    pub private_key_path: Option<String>,
}
```

## Implementation Steps

### 1. Create ssh_presets.rs
```rust
fn presets_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
        .join(".devtools")
        .join("ssh-presets.json")
}
```

### 2. CRUD Commands
```rust
#[tauri::command]
pub fn ssh_preset_list() -> Result<Vec<SshPreset>, String>

#[tauri::command]
pub fn ssh_preset_save(preset: SshPreset) -> Result<(), String>
// Upsert by id

#[tauri::command]
pub fn ssh_preset_delete(id: String) -> Result<(), String>
```

### 3. Register in lib.rs
```rust
mod ssh_presets;
// invoke_handler:
ssh_presets::ssh_preset_list,
ssh_presets::ssh_preset_save,
ssh_presets::ssh_preset_delete,
```

## Todo
- [ ] Create ssh_presets.rs with SshPreset struct
- [ ] Implement list/save/delete commands
- [ ] Register in lib.rs
- [ ] Test: presets persist across app restart

## Success Criteria
- Presets saved to `~/.devtools/ssh-presets.json`
- CRUD operations work correctly
- File created automatically on first save
