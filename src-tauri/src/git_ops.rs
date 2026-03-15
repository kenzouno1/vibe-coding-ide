use serde::Serialize;
use std::process::Command;

/// Run a git command and return stdout as string
fn git(args: &[&str], cwd: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
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

    let status_output = git(&["status", "--porcelain=v1"], &cwd)?;
    let files: Vec<GitFileStatus> = status_output
        .lines()
        .filter(|l| l.len() >= 3)
        .map(|line| {
            let index_status = &line[0..1];
            let worktree_status = &line[1..2];
            let path = line[3..].to_string();

            if index_status != " " && index_status != "?" {
                GitFileStatus {
                    path: path.clone(),
                    status: index_status.to_string(),
                    staged: true,
                }
            } else {
                GitFileStatus {
                    path,
                    status: if worktree_status == "?" {
                        "?".to_string()
                    } else {
                        worktree_status.to_string()
                    },
                    staged: false,
                }
            }
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
    git(&args, &cwd)
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
