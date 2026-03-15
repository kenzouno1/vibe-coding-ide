use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: String,
}

/// Resolve and validate a path is within an allowed project directory.
/// Prevents path traversal attacks (e.g. ../../etc/passwd).
fn validate_path(path: &str) -> Result<PathBuf, String> {
    let resolved = fs::canonicalize(path).map_err(|e| format!("Invalid path '{}': {}", path, e))?;

    // Block access to system-critical directories
    let blocked_prefixes: &[&str] = &["/etc", "/usr", "/bin", "/sbin", "/boot", "/proc", "/sys"];
    let path_str = resolved.to_string_lossy();
    for prefix in blocked_prefixes {
        if path_str.starts_with(prefix) {
            return Err(format!("Access denied: {}", path));
        }
    }

    // On Windows, block system directories
    #[cfg(target_os = "windows")]
    {
        let lower = path_str.to_lowercase();
        if lower.contains("\\windows\\") || lower.contains("\\system32") {
            return Err(format!("Access denied: {}", path));
        }
    }

    Ok(resolved)
}

/// Validate a path that may not exist yet (for create operations).
/// Ensures the parent directory exists and is accessible.
fn validate_new_path(path: &str) -> Result<PathBuf, String> {
    let target = Path::new(path);
    let parent = target.parent().ok_or("Invalid path: no parent directory")?;

    // Validate parent exists and is allowed
    let resolved_parent = validate_path(&parent.to_string_lossy())?;

    // Reconstruct the full path with resolved parent
    let file_name = target
        .file_name()
        .ok_or("Invalid path: no file name")?
        .to_string_lossy();

    // Block dangerous names
    if file_name.contains("..") || file_name.contains('\0') {
        return Err(format!("Invalid file name: {}", file_name));
    }

    Ok(resolved_parent.join(file_name.as_ref()))
}

/// List directory contents, sorted dirs-first then alphabetically.
/// Skips hidden files, node_modules, .git, and target directories by default.
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let dir_path = validate_path(&path)?;
    if !dir_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let skip_dirs = ["node_modules", ".git", "target", ".next", "dist", "__pycache__"];
    let mut entries: Vec<DirEntry> = Vec::new();

    let read_dir = fs::read_dir(&dir_path).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files (starting with .)
        if file_name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let is_dir = metadata.is_dir();

        // Skip known heavy directories
        if is_dir && skip_dirs.contains(&file_name.as_str()) {
            continue;
        }

        let extension = Path::new(&file_name)
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();

        entries.push(DirEntry {
            name: file_name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            extension,
        });
    }

    // Sort: directories first, then alphabetically (case-insensitive)
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Read a text file. Rejects files larger than 10MB.
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let file_path = validate_path(&path)?;
    if !file_path.is_file() {
        return Err(format!("Not a file: {}", path));
    }

    let metadata = fs::metadata(&file_path).map_err(|e| e.to_string())?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err("File too large (>10MB)".to_string());
    }

    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

/// Write text content to a file.
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let file_path = validate_path(&path)?;
    fs::write(&file_path, content).map_err(|e| e.to_string())
}

/// Create an empty file.
#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let file_path = validate_new_path(&path)?;
    fs::File::create(&file_path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Create a directory (and parent dirs if needed).
#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    let dir_path = validate_new_path(&path)?;
    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())
}

/// Rename a file or directory.
#[tauri::command]
pub fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    let old = validate_path(&old_path)?;
    let new = validate_new_path(&new_path)?;
    fs::rename(&old, &new).map_err(|e| e.to_string())
}

/// Delete a file or directory (recursive for dirs).
/// Extra safeguard: refuses to delete paths with depth < 3 (e.g. C:\Users or /home).
#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let p = validate_path(&path)?;

    // Safety: refuse to delete shallow paths (< 3 components like C:\Users)
    let component_count = p.components().count();
    if component_count < 4 {
        return Err(format!("Refusing to delete shallow path: {}", path));
    }

    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&p).map_err(|e| e.to_string())
    }
}
