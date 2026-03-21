use serde::Serialize;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Run a git command and return stdout as string
fn git(args: &[&str], cwd: &str) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(cwd);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        // Some git commands write to stderr but succeed (e.g., status)
        if output.status.code() == Some(1) && !stderr.contains("fatal") {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(stderr)
        }
    }
}

#[derive(Serialize, Clone)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,   // "M", "A", "D", "?", "R", etc.
    pub staged: bool,
}

#[derive(Serialize, Clone)]
pub struct GitStatusResult {
    pub branch: String,
    pub files: Vec<GitFileStatus>,
}

/// Get git status with branch info
#[tauri::command]
pub fn git_status(cwd: String) -> Result<GitStatusResult, String> {
    let branch_output = git(&["branch", "--show-current"], &cwd)?;
    let branch = branch_output.trim().to_string();

    let status_output = git(&["status", "--porcelain=v1", "-uall"], &cwd)?;
    let files: Vec<GitFileStatus> = status_output
        .lines()
        .filter(|l| l.len() >= 3)
        .flat_map(|line| {
            let index_status = &line[0..1];
            let worktree_status = &line[1..2];
            let path = line[3..].to_string();
            let mut entries = Vec::with_capacity(2);

            // Staged change (index column)
            if index_status != " " && index_status != "?" {
                entries.push(GitFileStatus {
                    path: path.clone(),
                    status: index_status.to_string(),
                    staged: true,
                });
            }

            // Unstaged change (worktree column)
            if worktree_status != " " {
                entries.push(GitFileStatus {
                    path,
                    status: if worktree_status == "?" {
                        "?".to_string()
                    } else {
                        worktree_status.to_string()
                    },
                    staged: false,
                });
            }

            entries
        })
        .collect();

    Ok(GitStatusResult { branch, files })
}

/// Get diff for a specific file
#[tauri::command]
pub fn git_diff(cwd: String, path: String, staged: bool) -> Result<String, String> {
    let mut args = vec!["diff"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&path);
    let result = git(&args, &cwd)?;

    // If diff is empty, the file may be untracked — show content as "all added"
    if result.trim().is_empty() {
        let full_path = std::path::Path::new(&cwd).join(&path);
        if full_path.is_file() {
            if let Ok(content) = std::fs::read_to_string(&full_path) {
                let mut diff_output = format!("--- /dev/null\n+++ b/{}\n", path);
                let lines: Vec<&str> = content.lines().collect();
                diff_output.push_str(&format!("@@ -0,0 +1,{} @@\n", lines.len()));
                for line in &lines {
                    diff_output.push('+');
                    diff_output.push_str(line);
                    diff_output.push('\n');
                }
                return Ok(diff_output);
            }
        }
    }

    Ok(result)
}

/// Stage a file
#[tauri::command]
pub fn git_add(cwd: String, path: String) -> Result<(), String> {
    git(&["add", "--", &path], &cwd)?;
    Ok(())
}

/// Unstage a file
#[tauri::command]
pub fn git_reset(cwd: String, path: String) -> Result<(), String> {
    git(&["reset", "HEAD", "--", &path], &cwd)?;
    Ok(())
}

/// Commit with message
#[tauri::command]
pub fn git_commit(cwd: String, message: String) -> Result<String, String> {
    git(&["commit", "-m", &message], &cwd)
}

/// Get current branch name
#[tauri::command]
pub fn git_branch(cwd: String) -> Result<String, String> {
    let output = git(&["branch", "--show-current"], &cwd)?;
    Ok(output.trim().to_string())
}

/// Get recent log entries
#[tauri::command]
pub fn git_log(cwd: String, count: Option<u32>) -> Result<String, String> {
    let n = count.unwrap_or(20).to_string();
    git(
        &["log", "--oneline", "--decorate", "-n", &n],
        &cwd,
    )
}

/// Validate branch/tag names — reject names starting with `-` to prevent flag injection
fn validate_ref_name(name: &str) -> Result<(), String> {
    if name.starts_with('-') {
        return Err("Name cannot start with '-'".to_string());
    }
    if name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct AheadBehind {
    pub ahead: u32,
    pub behind: u32,
}

/// Get ahead/behind counts relative to upstream
#[tauri::command]
pub fn git_ahead_behind(cwd: String) -> Result<AheadBehind, String> {
    let result = git(&["rev-list", "--count", "--left-right", "@{upstream}...HEAD"], &cwd);
    match result {
        Ok(output) => {
            let parts: Vec<&str> = output.trim().split('\t').collect();
            if parts.len() == 2 {
                let behind = parts[0].parse::<u32>().unwrap_or(0);
                let ahead = parts[1].parse::<u32>().unwrap_or(0);
                Ok(AheadBehind { ahead, behind })
            } else {
                Ok(AheadBehind { ahead: 0, behind: 0 })
            }
        }
        // No upstream configured
        Err(_) => Ok(AheadBehind { ahead: 0, behind: 0 }),
    }
}

#[derive(Serialize, Clone)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

/// List all branches (local + remote) using separate queries to avoid misclassification
#[tauri::command]
pub fn git_branches(cwd: String) -> Result<Vec<BranchInfo>, String> {
    let mut branches = Vec::new();

    // Local branches
    let local_output = git(&["branch", "--format=%(refname:short)\t%(HEAD)"], &cwd)?;
    for line in local_output.lines().filter(|l| !l.is_empty()) {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 2 { continue; }
        branches.push(BranchInfo {
            name: parts[0].to_string(),
            is_current: parts[1].trim() == "*",
            is_remote: false,
        });
    }

    // Remote branches
    let remote_output = git(&["branch", "-r", "--format=%(refname:short)"], &cwd)?;
    for line in remote_output.lines().filter(|l| !l.is_empty()) {
        let name = line.trim().to_string();
        if name.ends_with("/HEAD") { continue; }
        branches.push(BranchInfo { name, is_current: false, is_remote: true });
    }

    Ok(branches)
}

/// Switch to an existing branch
#[tauri::command]
pub fn git_switch_branch(cwd: String, name: String) -> Result<(), String> {
    validate_ref_name(&name)?;
    git(&["switch", &name], &cwd)?;
    Ok(())
}

/// Create a new branch, optionally checking it out
#[tauri::command]
pub fn git_create_branch(cwd: String, name: String, checkout: bool) -> Result<(), String> {
    validate_ref_name(&name)?;
    if checkout {
        git(&["switch", "-c", &name], &cwd)?;
    } else {
        git(&["branch", &name], &cwd)?;
    }
    Ok(())
}

/// Push to remote; auto-detects if upstream needs to be set
#[tauri::command]
pub fn git_push(cwd: String) -> Result<String, String> {
    let branch = git(&["branch", "--show-current"], &cwd)?;
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("Cannot push from detached HEAD".to_string());
    }
    // Check if upstream is configured
    let has_upstream = git(&["config", &format!("branch.{}.remote", branch)], &cwd).is_ok();
    if has_upstream {
        git(&["push"], &cwd)
    } else {
        git(&["push", "--set-upstream", "origin", branch], &cwd)
    }
}

/// Pull from remote
#[tauri::command]
pub fn git_pull(cwd: String) -> Result<String, String> {
    git(&["pull"], &cwd)
}

/// List tags sorted by creation date (newest first)
#[tauri::command]
pub fn git_tags(cwd: String) -> Result<Vec<String>, String> {
    let output = git(&["tag", "--list", "--sort=-creatordate"], &cwd)?;
    let tags: Vec<String> = output.lines().filter(|l| !l.is_empty()).map(String::from).collect();
    Ok(tags)
}

/// Create a tag (lightweight or annotated)
#[tauri::command]
pub fn git_create_tag(cwd: String, name: String, message: Option<String>) -> Result<(), String> {
    validate_ref_name(&name)?;
    match message {
        Some(msg) if !msg.is_empty() => { git(&["tag", "-a", &name, "-m", &msg], &cwd)?; }
        _ => { git(&["tag", &name], &cwd)?; }
    }
    Ok(())
}

/// Delete a local tag
#[tauri::command]
pub fn git_delete_tag(cwd: String, name: String) -> Result<(), String> {
    validate_ref_name(&name)?;
    git(&["tag", "-d", &name], &cwd)?;
    Ok(())
}
