use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

/// Split byte slice at the last valid UTF-8 boundary.
/// Returns (valid_utf8_bytes, incomplete_trailing_bytes).
/// Prevents multi-byte characters (Vietnamese, CJK) from being corrupted
/// when split across read buffer boundaries.
fn split_at_utf8_boundary(bytes: &[u8]) -> (&[u8], &[u8]) {
    match std::str::from_utf8(bytes) {
        Ok(_) => (bytes, &[]),
        Err(e) => {
            let valid_up_to = e.valid_up_to();
            (&bytes[..valid_up_to], &bytes[valid_up_to..])
        }
    }
}

/// Holds a PTY master handle and its writer
struct PtySession {
    writer: Box<dyn Write + Send>,
    // master kept alive to prevent PTY from closing
    _master: Box<dyn MasterPty + Send>,
}

/// Thread-safe map of session ID → PTY session
pub struct PtyState {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PtyOutput {
    pub id: String,
    pub data: String,
}

/// Spawn a new PTY session, return its ID
#[tauri::command]
pub fn spawn_pty(
    state: tauri::State<'_, PtyState>,
    app: AppHandle,
    cwd: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let size = PtySize {
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    // Determine shell and working directory
    let shell = std::env::var("COMSPEC")
        .or_else(|_| std::env::var("SHELL"))
        .unwrap_or_else(|_| "cmd.exe".to_string());

    let mut cmd = CommandBuilder::new(&shell);
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    pair.slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;

    // Get writer from master
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get writer: {e}"))?;

    // Get reader from master for streaming output
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {e}"))?;

    let id = uuid::Uuid::new_v4().to_string();

    // Store session
    {
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(
            id.clone(),
            PtySession {
                writer,
                _master: pair.master,
            },
        );
    }

    // Spawn reader thread to stream PTY output to frontend.
    // Uses UTF-8 safe buffering to avoid corrupting multi-byte characters
    // (Vietnamese, CJK, etc.) that may be split across read boundaries.
    let session_id = id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut leftover = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    // Prepend any leftover bytes from previous read
                    let chunk = if leftover.is_empty() {
                        &buf[..n]
                    } else {
                        leftover.extend_from_slice(&buf[..n]);
                        leftover.as_slice()
                    };

                    // Find the last valid UTF-8 boundary
                    let (valid, remainder) = split_at_utf8_boundary(chunk);
                    if !valid.is_empty() {
                        // split_at_utf8_boundary guarantees valid UTF-8
                        let data = std::str::from_utf8(valid).unwrap().to_string();
                        let _ = app.emit(
                            "pty-output",
                            PtyOutput {
                                id: session_id.clone(),
                                data,
                            },
                        );
                    }

                    // Keep incomplete trailing bytes for next read.
                    // Safety valve: max UTF-8 char is 4 bytes. If leftover exceeds
                    // that, we have genuinely invalid data (binary output) — flush
                    // with lossy conversion to avoid unbounded memory growth.
                    leftover = remainder.to_vec();
                    if leftover.len() > 4 {
                        let data = String::from_utf8_lossy(&leftover).to_string();
                        let _ = app.emit(
                            "pty-output",
                            PtyOutput {
                                id: session_id.clone(),
                                data,
                            },
                        );
                        leftover.clear();
                    }
                }
                Err(_) => break,
            }
        }
    });

    Ok(id)
}

/// Write data to a PTY session
#[tauri::command]
pub fn write_pty(
    state: tauri::State<'_, PtyState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("Session {id} not found"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Write failed: {e}"))?;
    Ok(())
}

/// Resize a PTY session
#[tauri::command]
pub fn resize_pty(
    state: tauri::State<'_, PtyState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("Session {id} not found"))?;
    session
        ._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize failed: {e}"))?;
    Ok(())
}

/// Kill a PTY session
#[tauri::command]
pub fn kill_pty(state: tauri::State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions
        .remove(&id)
        .ok_or_else(|| format!("Session {id} not found"))?;
    // Dropping the session closes the master, which kills the child process
    Ok(())
}
