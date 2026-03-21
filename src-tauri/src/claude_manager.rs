use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

/// State for managing Claude CLI subprocess sessions
pub struct ClaudeState {
    sessions: Arc<Mutex<HashMap<String, ClaudeSession>>>,
}

struct ClaudeSession {
    child: Child,
}

impl ClaudeState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Drop for ClaudeState {
    fn drop(&mut self) {
        // Kill all running Claude processes on shutdown
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, mut session) in sessions.drain() {
                let _ = session.child.kill();
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ClaudeStreamEvent {
    pub session_id: String,
    pub line: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ClaudeCompleteEvent {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

/// Return the absolute path to ~/.devtools/agent-workspace.
#[tauri::command]
pub fn claude_agent_workspace_path() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let ws = home.join(".devtools").join("agent-workspace");
    std::fs::create_dir_all(&ws).map_err(|e| format!("Failed to create agent workspace: {e}"))?;
    ws.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid workspace path".to_string())
}

/// Create per-session SSH workspace with CLAUDE.md containing session context.
/// Returns path to `~/.devtools/agent-workspace/sessions/<connId>/`.
#[tauri::command]
pub fn claude_ssh_workspace(
    conn_id: String,
    host: String,
    username: String,
) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let parent_ws = home.join(".devtools").join("agent-workspace");
    let session_ws = parent_ws.join("sessions").join(&conn_id);
    fs::create_dir_all(&session_ws).map_err(|e| format!("{e}"))?;

    let parent_path = parent_ws.to_str().unwrap_or("~/.devtools/agent-workspace");
    let claude_md = format!(
        "# SSH Session — {username}@{host}\n\n\
         - **Session ID:** `{conn_id}`\n\
         - **Host:** {host}\n\
         - **User:** {username}\n\n\
         You are connected to **{host}** as **{username}**.\n\n\
         ## Tools\n\n\
         SSH tools are located at `{parent_path}`.\n\n\
         ```bash\n\
         node {parent_path}/ssh-exec.js list\n\
         node {parent_path}/ssh-exec.js exec {conn_id} \"command\"\n\
         node {parent_path}/ssh-exec.js write {conn_id} \"data\"\n\
         node {parent_path}/ssh-exec.js read {conn_id} 3\n\
         ```\n",
        username = username,
        host = host,
        conn_id = conn_id,
        parent_path = parent_path.replace('\\', "/"),
    );
    let _ = fs::write(session_ws.join("CLAUDE.md"), claude_md);

    session_ws
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid path".to_string())
}

/// Check if `claude` CLI is available on PATH
#[tauri::command]
pub fn claude_check_installed() -> Result<bool, String> {
    match Command::new("claude").arg("--version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

/// Send a message to Claude via CLI subprocess with NDJSON streaming.
/// Spawns `claude -p "<msg>" --output-format stream-json --verbose --cwd <dir>`.
/// Optionally resumes a conversation with `--resume <session_id>`.
#[tauri::command]
pub fn claude_send_message(
    state: tauri::State<'_, ClaudeState>,
    app: AppHandle,
    session_id: String,
    message: String,
    cwd: String,
    resume_session: Option<String>,
    model_override: Option<String>,
    permission_mode_override: Option<String>,
) -> Result<(), String> {
    // Kill any existing process for this session before starting new one
    {
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(mut old) = sessions.remove(&session_id) {
            let _ = old.child.kill();
        }
    }

    // Determine effective permission mode: allowlist valid values, default to acceptEdits
    const ALLOWED_MODES: &[&str] = &["acceptEdits", "plan", "default", "bypassPermissions"];
    let effective_mode = permission_mode_override
        .as_deref()
        .filter(|m| ALLOWED_MODES.contains(m))
        .unwrap_or("acceptEdits");

    let mut cmd = Command::new("claude");
    cmd.arg("-p")
        .arg(&message)
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        // Enable token-by-token streaming via stream_event wrapper
        .arg("--include-partial-messages")
        // Permission mode: single flag, validated above
        .arg("--permission-mode")
        .arg(effective_mode)
        // Whitelist safe tools so Claude doesn't block on permission prompts
        .arg("--allowedTools")
        .arg("Read,Edit,Write,Bash,Glob,Grep,WebSearch,WebFetch")
        // Prevent runaway agents from draining budget
        .arg("--max-turns")
        .arg("25");

    if !cwd.is_empty() {
        cmd.current_dir(&cwd);
    }

    if let Some(ref resume_id) = resume_session {
        cmd.arg("--resume").arg(resume_id);
    }

    // Apply model override from /model command (safe: Command::arg is not shell-injectable)
    if let Some(ref model) = model_override {
        cmd.arg("--model").arg(model);
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn claude: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture claude stdout")?;

    // Store session
    {
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id.clone(), ClaudeSession { child });
    }

    let sessions_ref = Arc::clone(&state.sessions);
    let sid = session_id.clone();

    // Spawn reader thread for NDJSON line-by-line streaming
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(text) if !text.is_empty() => {
                    let _ = app.emit(
                        "claude-stream",
                        ClaudeStreamEvent {
                            session_id: sid.clone(),
                            line: text,
                        },
                    );
                }
                Err(_) => break,
                _ => {}
            }
        }

        // Process exited — get exit code and clean up
        let exit_code = if let Ok(mut sessions) = sessions_ref.lock() {
            sessions
                .remove(&sid)
                .and_then(|mut s| s.child.wait().ok())
                .and_then(|s| s.code())
        } else {
            None
        };

        let _ = app.emit(
            "claude-complete",
            ClaudeCompleteEvent {
                session_id: sid,
                exit_code,
            },
        );
    });

    Ok(())
}

/// Cancel a running Claude request by killing the subprocess
#[tauri::command]
pub fn claude_cancel(
    state: tauri::State<'_, ClaudeState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&session_id) {
        session
            .child
            .kill()
            .map_err(|e| format!("Failed to kill claude process: {e}"))?;
    }
    Ok(())
}

/// Save raw bytes to a temp file for image/file attachments.
/// Returns the absolute path of the saved file.
#[tauri::command]
pub fn claude_save_temp_file(filename: String, data: Vec<u8>) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("devtools-claude");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {e}"))?;

    // Unique prefix to avoid collisions
    let unique_name = format!("{}_{}", uuid::Uuid::new_v4(), filename);
    let file_path = temp_dir.join(&unique_name);

    let mut file =
        fs::File::create(&file_path).map_err(|e| format!("Failed to create temp file: {e}"))?;
    file.write_all(&data)
        .map_err(|e| format!("Failed to write temp file: {e}"))?;

    file_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid temp file path".to_string())
}

/// Clean up temp files after they've been sent to Claude.
/// Uses canonicalize to prevent path traversal via symlinks or `..` components.
#[tauri::command]
pub fn claude_cleanup_temp_files(paths: Vec<String>) -> Result<(), String> {
    let allowed_dir = match fs::canonicalize(std::env::temp_dir().join("devtools-claude")) {
        Ok(d) => d,
        Err(_) => return Ok(()), // temp dir doesn't exist yet, nothing to clean
    };
    for path in &paths {
        if let Ok(canonical) = fs::canonicalize(path) {
            if canonical.starts_with(&allowed_dir) {
                let _ = fs::remove_file(&canonical);
            }
        }
    }
    Ok(())
}

/// Discovered slash command from .claude/commands/ directories
#[derive(Serialize, Deserialize, Clone)]
pub struct DiscoveredCommand {
    /// Command name (e.g. "gsd:progress", "ccs", "cook")
    pub name: String,
    /// Description from YAML frontmatter
    pub description: String,
    /// Scope: "global" or "project"
    pub scope: String,
}

/// Extract a YAML frontmatter field value, stripping surrounding quotes.
fn strip_yaml_quotes(s: &str) -> String {
    let trimmed = s.trim();
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        trimmed[1..trimmed.len() - 1].to_string()
    } else {
        trimmed.to_string()
    }
}

/// Extract description (and optionally name) from YAML frontmatter.
fn extract_frontmatter(path: &Path) -> (Option<String>, Option<String>) {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return (None, None),
    };
    let mut lines = content.lines();
    if lines.next().map(|l| l.trim()) != Some("---") {
        return (None, None);
    }
    let mut description = None;
    let mut name = None;
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if let Some(val) = trimmed.strip_prefix("description:") {
            description = Some(strip_yaml_quotes(val));
        }
        if let Some(val) = trimmed.strip_prefix("name:") {
            name = Some(strip_yaml_quotes(val));
        }
    }
    (description, name)
}

/// Scan a commands directory for .md files and build command list.
/// Files at root → command name = stem (e.g. "ccs.md" → "ccs")
/// Files in subdirs → command name = dir:stem (e.g. "gsd/progress.md" → "gsd:progress")
fn scan_commands_dir(dir: &Path, scope: &str) -> Vec<DiscoveredCommand> {
    let mut commands = Vec::new();
    if !dir.is_dir() {
        return commands;
    }

    // Walk directory (one level deep for subdirs)
    let walk = |base: &Path, prefix: &str| {
        let mut cmds = Vec::new();
        if let Ok(entries) = fs::read_dir(base) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "md").unwrap_or(false) && path.is_file() {
                    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
                    let name = if prefix.is_empty() {
                        stem.to_string()
                    } else {
                        format!("{prefix}:{stem}")
                    };
                    let (description, _) = extract_frontmatter(&path);
                    let description = description.unwrap_or_default();
                    cmds.push(DiscoveredCommand {
                        name,
                        description,
                        scope: scope.to_string(),
                    });
                }
            }
        }
        cmds
    };

    // Root-level commands
    commands.extend(walk(dir, ""));

    // Subdirectory commands (one level)
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let dir_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                commands.extend(walk(&path, &dir_name));
            }
        }
    }

    commands
}

/// Scan ~/.claude/skills/ for SKILL.md files in each subdirectory.
/// Each skill folder has a SKILL.md with name/description frontmatter.
fn scan_skills_dir(dir: &Path) -> Vec<DiscoveredCommand> {
    let mut skills = Vec::new();
    if !dir.is_dir() {
        return skills;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let skill_file = path.join("SKILL.md");
            if !skill_file.is_file() {
                continue;
            }
            let dir_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let (description, frontmatter_name) = extract_frontmatter(&skill_file);
            // Use frontmatter name if available (e.g. "ck:cook"), otherwise use dir name
            let name = frontmatter_name.unwrap_or(dir_name);
            skills.push(DiscoveredCommand {
                name,
                description: description.unwrap_or_default(),
                scope: "global".to_string(),
            });
        }
    }
    skills
}

/// Discover slash commands from global commands, skills, and project commands.
#[tauri::command]
pub fn claude_discover_commands(project_path: String) -> Result<Vec<DiscoveredCommand>, String> {
    let mut commands = Vec::new();

    if let Some(home) = dirs::home_dir() {
        let claude_dir = home.join(".claude");

        // Global commands: ~/.claude/commands/
        commands.extend(scan_commands_dir(&claude_dir.join("commands"), "global"));

        // Global skills: ~/.claude/skills/*/SKILL.md
        commands.extend(scan_skills_dir(&claude_dir.join("skills")));
    }

    // Project commands: <project>/.claude/commands/
    if !project_path.is_empty() {
        let project_dir = PathBuf::from(&project_path)
            .join(".claude")
            .join("commands");
        commands.extend(scan_commands_dir(&project_dir, "project"));
    }

    // Sort by name for consistent ordering
    commands.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(commands)
}

/// Session metadata from Claude Code's JSONL session files
#[derive(Serialize, Deserialize, Clone)]
pub struct ClaudeSessionMeta {
    pub id: String,
    pub title: String,
    /// Unix timestamp in milliseconds
    pub timestamp: u64,
}

/// Convert a project path to Claude's directory name format.
/// e.g. "C:\Users\Bug\Desktop\devtools" → "C--Users-Bug-Desktop-devtools"
fn project_path_to_claude_dir(project_path: &str) -> String {
    project_path
        .replace(':', "-")
        .replace('\\', "-")
        .replace('/', "-")
}

/// List Claude Code sessions for a project by scanning ~/.claude/projects/<hash>/*.jsonl.
/// Extracts session ID, first user message as title, and timestamp.
#[tauri::command]
pub fn claude_list_sessions(project_path: String) -> Result<Vec<ClaudeSessionMeta>, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let dir_name = project_path_to_claude_dir(&project_path);
    let sessions_dir = home.join(".claude").join("projects").join(&dir_name);

    if !sessions_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut sessions: Vec<ClaudeSessionMeta> = Vec::new();

    let entries = fs::read_dir(&sessions_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "jsonl").unwrap_or(false) && path.is_file() {
            if let Some(meta) = extract_session_meta(&path) {
                sessions.push(meta);
            }
        }
    }

    // Sort by timestamp descending (most recent first)
    sessions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    // Limit to 30 most recent
    sessions.truncate(30);

    Ok(sessions)
}

/// Read the first few lines of a session JSONL to extract metadata.
fn extract_session_meta(path: &Path) -> Option<ClaudeSessionMeta> {
    use std::io::BufRead;

    let stem = path.file_stem()?.to_string_lossy().to_string();
    let file = fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file);

    let mut timestamp: Option<u64> = None;
    let mut title: Option<String> = None;

    // Read up to 30 lines to find the first real user message
    for line in reader.lines().take(30).flatten() {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line) {
            // Get timestamp from any early line
            if timestamp.is_none() {
                if let Some(ts_str) = parsed.get("timestamp").and_then(|v| v.as_str()) {
                    // Parse ISO 8601 to unix millis
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                        timestamp = Some(dt.timestamp_millis() as u64);
                    }
                }
            }

            // Find first non-meta user message for title
            if title.is_none()
                && parsed.get("type").and_then(|v| v.as_str()) == Some("user")
                && parsed.get("isMeta").and_then(|v| v.as_bool()) != Some(true)
            {
                if let Some(content) = parsed
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                {
                    let clean: String = content
                        .chars()
                        .take(100)
                        .filter(|c| !c.is_control())
                        .collect();
                    title = Some(clean);
                }
            }

            if timestamp.is_some() && title.is_some() {
                break;
            }
        }
    }

    // Fall back to file modification time if no timestamp found
    let ts = timestamp.unwrap_or_else(|| {
        fs::metadata(path)
            .and_then(|m| m.modified())
            .map(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64
            })
            .unwrap_or(0)
    });

    Some(ClaudeSessionMeta {
        id: stem,
        title: title.unwrap_or_else(|| "Untitled".to_string()),
        timestamp: ts,
    })
}
