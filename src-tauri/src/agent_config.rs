use regex::Regex;
use serde::Deserialize;
use std::path::PathBuf;

/// Security configuration for the agent WebSocket server.
/// Enforces command blocklist, output caps, and timeout limits.
pub struct AgentConfig {
    /// Regex patterns for blocked commands (matched against full command string)
    pub command_blocklist: Vec<Regex>,
    /// Max execution timeout in ms (capped at 120_000)
    pub max_timeout_ms: u64,
    /// Max output bytes before truncation
    pub max_output_bytes: usize,
}

#[derive(Deserialize)]
struct ConfigFile {
    command_blocklist: Option<Vec<String>>,
    max_timeout_ms: Option<u64>,
    max_output_bytes: Option<usize>,
}

const MAX_TIMEOUT_CAP: u64 = 120_000;

impl AgentConfig {
    /// Load config from ~/.devtools/agent-config.json or use defaults.
    pub fn load() -> Self {
        let config_path = dirs::home_dir()
            .unwrap_or_default()
            .join(".devtools")
            .join("agent-config.json");

        if let Ok(raw) = std::fs::read_to_string(&config_path) {
            if let Ok(file) = serde_json::from_str::<ConfigFile>(&raw) {
                return Self::from_file(file);
            }
        }
        Self::default()
    }

    fn from_file(file: ConfigFile) -> Self {
        let patterns = file.command_blocklist.unwrap_or_else(default_blocklist_strings);
        let command_blocklist = patterns
            .iter()
            .filter_map(|p| Regex::new(p).ok())
            .collect();

        Self {
            command_blocklist,
            max_timeout_ms: file
                .max_timeout_ms
                .unwrap_or(30_000)
                .min(MAX_TIMEOUT_CAP),
            max_output_bytes: file.max_output_bytes.unwrap_or(102_400),
        }
    }

    /// Check if a command is blocked. Returns the matching pattern if blocked.
    pub fn check_command(&self, cmd: &str) -> Option<String> {
        for re in &self.command_blocklist {
            if re.is_match(cmd) {
                return Some(re.to_string());
            }
        }
        None
    }

    /// Clamp a requested timeout to the configured maximum.
    pub fn clamp_timeout(&self, requested_ms: u64) -> u64 {
        requested_ms.min(self.max_timeout_ms)
    }

    /// Truncate output if it exceeds max_output_bytes (char-boundary safe).
    pub fn truncate_output(&self, output: &str) -> String {
        if output.len() <= self.max_output_bytes {
            return output.to_string();
        }
        // Find a valid char boundary at or before max_output_bytes
        let mut end = self.max_output_bytes;
        while end > 0 && !output.is_char_boundary(end) {
            end -= 1;
        }
        let mut truncated = output[..end].to_string();
        truncated.push_str("\n[OUTPUT TRUNCATED]");
        truncated
    }
}

fn default_blocklist_strings() -> Vec<String> {
    vec![
        r"rm\s+-rf\s+/\s*$".to_string(),
        r">\s*/dev/sd[a-z]".to_string(),
        r"mkfs\b".to_string(),
        r"dd\s+if=.+of=/dev/".to_string(),
        r":\(\)\{.*\|.*\};:".to_string(), // fork bomb
    ]
}

fn default_blocklist() -> Vec<Regex> {
    default_blocklist_strings()
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect()
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            command_blocklist: default_blocklist(),
            max_timeout_ms: 30_000,
            max_output_bytes: 102_400,
        }
    }
}

/// Return the path to the config file (for documentation/UI purposes).
#[allow(dead_code)]
pub fn config_file_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".devtools")
        .join("agent-config.json")
}
