use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct SshPreset {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub private_key_path: Option<String>,
}

fn presets_path() -> PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".devtools");
    fs::create_dir_all(&dir).ok();
    dir.join("ssh-presets.json")
}

#[tauri::command]
pub fn ssh_preset_list() -> Result<Vec<SshPreset>, String> {
    let path = presets_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let json = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

/// Upsert preset by id
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
