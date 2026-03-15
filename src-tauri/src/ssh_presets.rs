use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Reusable SSH config template (no host — that lives in SshSavedSession)
#[derive(Serialize, Deserialize, Clone)]
pub struct SshPreset {
    pub id: String,
    pub name: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub private_key_path: Option<String>,
    pub startup_cmd: Option<String>,
}

/// Persisted server connection profile
#[derive(Serialize, Deserialize, Clone)]
pub struct SshSavedSession {
    pub id: String,
    pub name: String,
    pub host: String,
    pub preset_id: Option<String>,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub private_key_path: Option<String>,
    pub startup_cmd: Option<String>,
}

fn devtools_dir() -> PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".devtools");
    fs::create_dir_all(&dir).ok();
    dir
}

fn presets_path() -> PathBuf {
    devtools_dir().join("ssh-presets.json")
}

fn sessions_path() -> PathBuf {
    devtools_dir().join("ssh-sessions.json")
}

// ── Legacy migration ─────────────────────────────────────────────────
// Old presets had a `host` field. On first load, convert them to sessions.

#[derive(Deserialize)]
struct LegacyPreset {
    id: String,
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    private_key_path: Option<String>,
}

/// Migrate old presets (with host) to sessions if ssh-sessions.json doesn't exist yet
fn migrate_legacy_presets() {
    let sessions_file = sessions_path();
    if sessions_file.exists() {
        return; // already migrated
    }
    let presets_file = presets_path();
    if !presets_file.exists() {
        return; // nothing to migrate
    }
    let Ok(json) = fs::read_to_string(&presets_file) else { return };
    let Ok(legacy): Result<Vec<LegacyPreset>, _> = serde_json::from_str(&json) else { return };
    if legacy.is_empty() {
        return;
    }

    // Convert legacy presets → saved sessions
    let sessions: Vec<SshSavedSession> = legacy
        .into_iter()
        .map(|lp| SshSavedSession {
            id: lp.id,
            name: lp.name,
            host: lp.host,
            preset_id: None,
            port: lp.port,
            username: lp.username,
            auth_method: lp.auth_method,
            private_key_path: lp.private_key_path,
            startup_cmd: None,
        })
        .collect();

    if let Ok(json) = serde_json::to_string_pretty(&sessions) {
        fs::write(&sessions_file, json).ok();
    }
    // Clear old presets file (they are now sessions, user creates templates manually)
    fs::write(&presets_file, "[]").ok();
}

// ── Preset CRUD ──────────────────────────────────────────────────────

#[tauri::command]
pub fn ssh_preset_list() -> Result<Vec<SshPreset>, String> {
    let path = presets_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let json = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ssh_preset_save(preset: SshPreset) -> Result<(), String> {
    let mut presets = ssh_preset_list().unwrap_or_default();
    if let Some(existing) = presets.iter_mut().find(|p| p.id == preset.id) {
        *existing = preset;
    } else {
        presets.push(preset);
    }
    let json = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
    fs::write(presets_path(), json).map_err(|e| format!("Failed to save presets: {e}"))
}

#[tauri::command]
pub fn ssh_preset_delete(id: String) -> Result<(), String> {
    let mut presets = ssh_preset_list().unwrap_or_default();
    presets.retain(|p| p.id != id);
    let json = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
    fs::write(presets_path(), json).map_err(|e| format!("Failed to save presets: {e}"))
}

// ── Session CRUD ─────────────────────────────────────────────────────

#[tauri::command]
pub fn ssh_session_list() -> Result<Vec<SshSavedSession>, String> {
    migrate_legacy_presets();
    let path = sessions_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let json = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ssh_session_save(session: SshSavedSession) -> Result<(), String> {
    let mut sessions = ssh_session_list().unwrap_or_default();
    if let Some(existing) = sessions.iter_mut().find(|s| s.id == session.id) {
        *existing = session;
    } else {
        sessions.push(session);
    }
    let json = serde_json::to_string_pretty(&sessions).map_err(|e| e.to_string())?;
    fs::write(sessions_path(), json).map_err(|e| format!("Failed to save sessions: {e}"))
}

#[tauri::command]
pub fn ssh_session_delete(id: String) -> Result<(), String> {
    let mut sessions = ssh_session_list().unwrap_or_default();
    sessions.retain(|s| s.id != id);
    let json = serde_json::to_string_pretty(&sessions).map_err(|e| e.to_string())?;
    fs::write(sessions_path(), json).map_err(|e| format!("Failed to save sessions: {e}"))
}
