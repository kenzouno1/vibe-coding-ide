use serde::Serialize;
use std::collections::VecDeque;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

const MAX_ENTRIES: usize = 500;
const PREVIEW_LEN: usize = 2000;

#[derive(Serialize, Clone, Debug)]
pub struct AuditEntry {
    pub timestamp_ms: u64,
    pub session_id: String,
    pub command: String,
    pub status: String, // "ok" | "timeout" | "error" | "denied"
    pub duration_ms: u64,
    pub output_preview: String,
}

pub struct AuditLog {
    entries: Mutex<VecDeque<AuditEntry>>,
    log_file: PathBuf,
}

impl AuditLog {
    pub fn new() -> Self {
        let log_file = dirs::home_dir()
            .unwrap_or_default()
            .join(".devtools")
            .join("agent-audit.jsonl");
        Self {
            entries: Mutex::new(VecDeque::with_capacity(MAX_ENTRIES)),
            log_file,
        }
    }

    /// Record an audit entry, persist to file, and emit Tauri event.
    pub fn record(&self, entry: AuditEntry, app: &tauri::AppHandle) {
        // Append to in-memory ring buffer
        if let Ok(mut entries) = self.entries.lock() {
            if entries.len() >= MAX_ENTRIES {
                entries.pop_front();
            }
            entries.push_back(entry.clone());
        }

        // Append to JSONL file
        if let Ok(json) = serde_json::to_string(&entry) {
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.log_file)
            {
                let _ = writeln!(file, "{json}");
            }
        }

        // Emit Tauri event for real-time UI streaming
        use tauri::Emitter;
        let _ = app.emit("agent-audit-entry", &entry);
    }

    /// Get the last N entries for the frontend.
    pub fn get_recent(&self, count: usize) -> Vec<AuditEntry> {
        let entries = match self.entries.lock() {
            Ok(e) => e,
            Err(_) => return vec![],
        };
        entries.iter().rev().take(count).cloned().collect()
    }
}

/// Tauri command: get recent audit log entries.
#[tauri::command]
pub fn agent_get_audit_log(
    state: tauri::State<'_, std::sync::Arc<AuditLog>>,
    count: Option<usize>,
) -> Vec<AuditEntry> {
    state.get_recent(count.unwrap_or(50))
}

/// Build an AuditEntry from exec result.
pub fn make_entry(
    session_id: &str,
    command: &str,
    status: &str,
    duration_ms: u64,
    output: &str,
) -> AuditEntry {
    let preview = if output.len() > PREVIEW_LEN {
        let mut end = PREVIEW_LEN;
        while end > 0 && !output.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}...", &output[..end])
    } else {
        output.to_string()
    };
    AuditEntry {
        timestamp_ms: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        session_id: session_id.to_string(),
        command: command.to_string(),
        status: status.to_string(),
        duration_ms,
        output_preview: preview,
    }
}
