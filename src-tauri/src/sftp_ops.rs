use async_trait::async_trait;
use russh::client;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use russh_keys::ssh_key::PublicKey;
use std::sync::Arc;

#[derive(Serialize, Deserialize, Clone)]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub permissions: u32,
    pub modified: u64,
}

/// Minimal handler for SFTP-only connections (no terminal output needed)
struct SftpHandler;

#[async_trait]
impl client::Handler for SftpHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Create a temporary SFTP session for a single operation
async fn create_sftp_session(
    host: &str,
    port: u16,
    username: &str,
    auth_method: &str,
    password: Option<&str>,
    private_key_path: Option<&str>,
) -> Result<SftpSession, String> {
    let config = Arc::new(client::Config::default());
    let mut handle = client::connect(config, (host, port), SftpHandler)
        .await
        .map_err(|e| format!("SSH connect failed: {e}"))?;

    // Authenticate
    let auth_ok = match auth_method {
        "password" => handle
            .authenticate_password(username, password.unwrap_or(""))
            .await
            .map_err(|e| format!("Auth failed: {e}"))?,
        "key" => {
            let key_path = private_key_path.ok_or("Key path required")?;
            let key_pair = russh_keys::load_secret_key(key_path, password)
                .map_err(|e| format!("Load key failed: {e}"))?;
            let key_with_alg = russh_keys::key::PrivateKeyWithHashAlg::new(
                Arc::new(key_pair), None,
            ).map_err(|e| format!("Key prep failed: {e}"))?;
            handle
                .authenticate_publickey(username, key_with_alg)
                .await
                .map_err(|e| format!("Key auth failed: {e}"))?
        }
        _ => return Err(format!("Unknown auth: {auth_method}")),
    };

    if !auth_ok {
        return Err("Authentication failed".to_string());
    }

    // Open SFTP subsystem channel
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Channel open failed: {e}"))?;

    channel
        .request_subsystem(false, "sftp")
        .await
        .map_err(|e| format!("SFTP subsystem request failed: {e}"))?;

    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("SFTP session init failed: {e}"))?;

    Ok(sftp)
}

/// List remote directory contents
#[tauri::command]
pub async fn sftp_list_dir(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    path: String,
) -> Result<Vec<SftpEntry>, String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    let entries = sftp
        .read_dir(&path)
        .await
        .map_err(|e| format!("readdir failed: {e}"))?;

    let mut result: Vec<SftpEntry> = entries
        .into_iter()
        .filter_map(|entry| {
            let name = entry.file_name();
            if name == "." || name == ".." {
                return None;
            }
            let full_path = if path.ends_with('/') {
                format!("{path}{name}")
            } else {
                format!("{path}/{name}")
            };
            let attrs = entry.metadata();
            let is_dir = attrs.is_dir();
            Some(SftpEntry {
                name,
                path: full_path,
                is_dir,
                size: attrs.size.unwrap_or(0),
                permissions: attrs.permissions.map(|p| p & 0o777).unwrap_or(0),
                modified: attrs.mtime.unwrap_or(0) as u64,
            })
        })
        .collect();

    // Sort: directories first, then alphabetical
    result.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(result)
}

/// Download remote file to local path
#[tauri::command]
pub async fn sftp_download(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    use tokio::io::AsyncReadExt;
    let mut file = sftp
        .open(&remote_path)
        .await
        .map_err(|e| format!("Open remote file failed: {e}"))?;

    let mut contents = Vec::new();
    file.read_to_end(&mut contents)
        .await
        .map_err(|e| format!("Read failed: {e}"))?;

    std::fs::write(&local_path, &contents)
        .map_err(|e| format!("Write local file failed: {e}"))
}

/// Upload local file to remote path
#[tauri::command]
pub async fn sftp_upload(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    let contents = std::fs::read(&local_path)
        .map_err(|e| format!("Read local file failed: {e}"))?;

    use tokio::io::AsyncWriteExt;
    let mut file = sftp
        .create(&remote_path)
        .await
        .map_err(|e| format!("Create remote file failed: {e}"))?;

    file.write_all(&contents)
        .await
        .map_err(|e| format!("Write remote file failed: {e}"))
}

/// Create remote directory
#[tauri::command]
pub async fn sftp_mkdir(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    path: String,
) -> Result<(), String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    sftp.create_dir(&path)
        .await
        .map_err(|e| format!("mkdir failed: {e}"))
}

/// Delete remote file or directory
#[tauri::command]
pub async fn sftp_delete(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    if is_dir {
        sftp.remove_dir(&path)
            .await
            .map_err(|e| format!("rmdir failed: {e}"))
    } else {
        sftp.remove_file(&path)
            .await
            .map_err(|e| format!("unlink failed: {e}"))
    }
}

/// Create an empty file on remote
#[tauri::command]
pub async fn sftp_create_file(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    path: String,
) -> Result<(), String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    use tokio::io::AsyncWriteExt;
    let mut file = sftp
        .create(&path)
        .await
        .map_err(|e| format!("Create file failed: {e}"))?;
    file.flush()
        .await
        .map_err(|e| format!("Flush failed: {e}"))
}

/// Change file/dir permissions (chmod)
#[tauri::command]
pub async fn sftp_chmod(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    path: String,
    permissions: u32,
) -> Result<(), String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    let mut metadata = sftp
        .metadata(&path)
        .await
        .map_err(|e| format!("stat failed: {e}"))?;
    metadata.permissions = Some(permissions);
    sftp.set_metadata(&path, metadata)
        .await
        .map_err(|e| format!("chmod failed: {e}"))
}

/// Rename or move a file/directory
#[tauri::command]
pub async fn sftp_rename(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    sftp.rename(&old_path, &new_path)
        .await
        .map_err(|e| format!("rename failed: {e}"))
}

/// Copy a file on remote (read src, write dst)
#[tauri::command]
pub async fn sftp_copy(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    src_path: String,
    dst_path: String,
) -> Result<(), String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut src = sftp
        .open(&src_path)
        .await
        .map_err(|e| format!("Open src failed: {e}"))?;

    let mut contents = Vec::new();
    src.read_to_end(&mut contents)
        .await
        .map_err(|e| format!("Read src failed: {e}"))?;

    let mut dst = sftp
        .create(&dst_path)
        .await
        .map_err(|e| format!("Create dst failed: {e}"))?;

    dst.write_all(&contents)
        .await
        .map_err(|e| format!("Write dst failed: {e}"))
}

/// Download remote file to OS temp directory for editing.
/// Returns the local temp file path.
#[tauri::command]
pub async fn sftp_download_to_temp(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    remote_path: String,
) -> Result<String, String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    use tokio::io::AsyncReadExt;
    let mut file = sftp
        .open(&remote_path)
        .await
        .map_err(|e| format!("Open remote file failed: {e}"))?;

    let mut contents = Vec::new();
    file.read_to_end(&mut contents)
        .await
        .map_err(|e| format!("Read failed: {e}"))?;

    // Build temp path: {temp}/devtools-sftp/{host}/{remote_path}
    let temp_dir = std::env::temp_dir();
    let sanitized = remote_path.trim_start_matches('/');
    let local_path = temp_dir
        .join("devtools-sftp")
        .join(&host)
        .join(sanitized);

    if let Some(parent) = local_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Create temp dir failed: {e}"))?;
    }

    std::fs::write(&local_path, &contents)
        .map_err(|e| format!("Write temp file failed: {e}"))?;

    Ok(local_path.to_string_lossy().to_string())
}

/// Get file/dir metadata
#[tauri::command]
pub async fn sftp_stat(
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
    path: String,
) -> Result<SftpEntry, String> {
    let sftp = create_sftp_session(
        &host, port, &username, &auth_method,
        password.as_deref(), private_key_path.as_deref(),
    ).await?;

    let attrs = sftp
        .metadata(&path)
        .await
        .map_err(|e| format!("stat failed: {e}"))?;

    let name = path.rsplit('/').next().unwrap_or(&path).to_string();
    Ok(SftpEntry {
        name,
        path,
        is_dir: attrs.is_dir(),
        size: attrs.size.unwrap_or(0),
        permissions: attrs.permissions.map(|p| p & 0o777).unwrap_or(0),
        modified: attrs.mtime.unwrap_or(0) as u64,
    })
}
