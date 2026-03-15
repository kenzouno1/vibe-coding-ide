use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Serializable pane tree for persistence
#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum PaneNodeData {
    #[serde(rename = "leaf")]
    Leaf { id: String },
    #[serde(rename = "split")]
    Split {
        id: String,
        direction: String,
        ratio: f64,
        first: Box<PaneNodeData>,
        second: Box<PaneNodeData>,
    },
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionData {
    pub cwd: String,
    pub panes: PaneNodeData,
    pub view: String,
}

/// Get session file path for a project directory
fn session_path(cwd: &str) -> PathBuf {
    let hash = format!("{:x}", md5_simple(cwd));
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".devtools")
        .join("sessions");
    fs::create_dir_all(&dir).ok();
    dir.join(format!("{hash}.json"))
}

/// Simple string hash (not cryptographic, just for file naming)
fn md5_simple(s: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in s.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[tauri::command]
pub fn save_session(cwd: String, panes: PaneNodeData, view: String) -> Result<(), String> {
    let data = SessionData { cwd: cwd.clone(), panes, view };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    let path = session_path(&cwd);
    fs::write(path, json).map_err(|e| format!("Failed to save session: {e}"))
}

#[tauri::command]
pub fn load_session(cwd: String) -> Result<Option<SessionData>, String> {
    let path = session_path(&cwd);
    if !path.exists() {
        return Ok(None);
    }
    let json = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data: SessionData = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(Some(data))
}

/// Path to the projects list file
fn projects_list_path() -> PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".devtools");
    fs::create_dir_all(&dir).ok();
    dir.join("projects.json")
}

/// Get list of saved project paths
#[tauri::command]
pub fn list_projects() -> Result<Vec<String>, String> {
    let path = projects_list_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let json = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let projects: Vec<String> = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(projects)
}

/// Add a project path to the list
#[tauri::command]
pub fn add_project(path: String) -> Result<Vec<String>, String> {
    let mut projects = list_projects().unwrap_or_default();
    if !projects.contains(&path) {
        projects.insert(0, path);
    }
    let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
    fs::write(projects_list_path(), json).map_err(|e| e.to_string())?;
    Ok(projects)
}

/// Remove a project from the list
#[tauri::command]
pub fn remove_project(path: String) -> Result<Vec<String>, String> {
    let mut projects = list_projects().unwrap_or_default();
    projects.retain(|p| p != &path);
    let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
    fs::write(projects_list_path(), json).map_err(|e| e.to_string())?;
    Ok(projects)
}

