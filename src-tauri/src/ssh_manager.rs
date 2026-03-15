use async_trait::async_trait;
use russh::client::{self, Handler};
use russh::{Channel, ChannelId, Disconnect};
use russh_keys::ssh_key::PublicKey;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{broadcast, Mutex};

#[derive(Serialize, Deserialize, Clone)]
pub struct SshOutput {
    pub id: String,
    pub channel_id: String,
    pub data: String,
}

/// Client handler that forwards SSH channel data to the frontend.
/// Uses channel_labels to map russh ChannelId → our string channel_id.
pub(crate) struct SshClientHandler {
    app: AppHandle,
    session_id: String,
    channel_labels: Arc<Mutex<HashMap<ChannelId, String>>>,
    /// Broadcast sender for agent WS server output streaming
    output_tx: broadcast::Sender<(String, String, String)>,
}

#[async_trait]
impl Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let label = self.resolve_channel_label(channel).await;
        let text = String::from_utf8_lossy(data).to_string();
        let _ = self.app.emit(
            "ssh-output",
            SshOutput {
                id: self.session_id.clone(),
                channel_id: label.clone(),
                data: text.clone(),
            },
        );
        // Broadcast for agent WS server
        let _ = self.output_tx.send((self.session_id.clone(), label, text));
        Ok(())
    }

    async fn extended_data(
        &mut self,
        channel: ChannelId,
        _ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let label = self.resolve_channel_label(channel).await;
        let text = String::from_utf8_lossy(data).to_string();
        let _ = self.app.emit(
            "ssh-output",
            SshOutput {
                id: self.session_id.clone(),
                channel_id: label.clone(),
                data: text.clone(),
            },
        );
        let _ = self.output_tx.send((self.session_id.clone(), label, text));
        Ok(())
    }
}

impl SshClientHandler {
    async fn resolve_channel_label(&self, channel: ChannelId) -> String {
        let labels = self.channel_labels.lock().await;
        labels.get(&channel).cloned().unwrap_or_else(|| "default".to_string())
    }
}

/// Holds an SSH session with multiple channels
pub struct SshSession {
    pub handle: client::Handle<SshClientHandler>,
    pub channels: HashMap<String, Arc<Channel<client::Msg>>>,
    pub channel_labels: Arc<Mutex<HashMap<ChannelId, String>>>,
    pub host: String,
    pub username: String,
}

/// Thread-safe map of session ID → SSH session
pub struct SshState {
    pub sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    pub output_tx: broadcast::Sender<(String, String, String)>,
}

impl SshState {
    pub fn new() -> Self {
        let (output_tx, _) = broadcast::channel(1024);
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            output_tx,
        }
    }

}

#[derive(Serialize, Clone)]
pub struct SessionInfo {
    pub session_id: String,
    pub host: String,
    pub username: String,
    pub channels: Vec<String>,
}

/// Connect to SSH server, return session ID.
/// Opens a default channel with PTY + shell.
#[tauri::command]
pub async fn ssh_connect(
    state: tauri::State<'_, SshState>,
    app: AppHandle,
    host: String,
    port: u16,
    username: String,
    auth_method: String,
    password: Option<String>,
    private_key_path: Option<String>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let channel_labels = Arc::new(Mutex::new(HashMap::new()));

    let config = Arc::new(client::Config::default());
    let handler = SshClientHandler {
        app: app.clone(),
        session_id: id.clone(),
        channel_labels: Arc::clone(&channel_labels),
        output_tx: state.output_tx.clone(),
    };

    // TCP + SSH handshake
    let mut handle = client::connect(config, (host.as_str(), port), handler)
        .await
        .map_err(|e| format!("SSH connect failed: {e}"))?;

    // Authenticate
    let auth_ok = match auth_method.as_str() {
        "password" => {
            let pw = password.as_deref().unwrap_or("");
            handle
                .authenticate_password(&username, pw)
                .await
                .map_err(|e| format!("Auth failed: {e}"))?
        }
        "key" => {
            let key_path = private_key_path
                .as_deref()
                .ok_or("Private key path required")?;
            let key_pair = russh_keys::load_secret_key(key_path, password.as_deref())
                .map_err(|e| format!("Load key failed: {e}"))?;
            let key_with_alg = russh_keys::key::PrivateKeyWithHashAlg::new(
                Arc::new(key_pair),
                None,
            )
            .map_err(|e| format!("Key prep failed: {e}"))?;
            handle
                .authenticate_publickey(&username, key_with_alg)
                .await
                .map_err(|e| format!("Key auth failed: {e}"))?
        }
        _ => return Err(format!("Unknown auth method: {auth_method}")),
    };

    if !auth_ok {
        return Err("Authentication failed".to_string());
    }

    // Open default channel with PTY + shell
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Channel open failed: {e}"))?;

    // Register channel label BEFORE requesting PTY (data may arrive immediately)
    {
        let mut labels = channel_labels.lock().await;
        labels.insert(channel.id(), "default".to_string());
    }

    channel
        .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
        .await
        .map_err(|e| format!("PTY request failed: {e}"))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("Shell request failed: {e}"))?;

    // Store session with default channel
    let mut channels = HashMap::new();
    channels.insert("default".to_string(), Arc::new(channel));

    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(
            id.clone(),
            SshSession {
                handle,
                channels,
                channel_labels,
                host: host.clone(),
                username: username.clone(),
            },
        );
    }

    Ok(id)
}

/// Open a new channel on an existing SSH session.
/// Returns the new channel_id.
#[tauri::command]
pub async fn ssh_open_channel(
    state: tauri::State<'_, SshState>,
    session_id: String,
) -> Result<String, String> {
    let channel_id = uuid::Uuid::new_v4().to_string();
    let mut sessions = state.sessions.lock().await;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Session {session_id} not found"))?;

    // Open new channel on the same SSH connection
    let channel = session
        .handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Channel open failed: {e}"))?;

    // Register label before PTY request (data may arrive immediately)
    {
        let mut labels = session.channel_labels.lock().await;
        labels.insert(channel.id(), channel_id.clone());
    }

    channel
        .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
        .await
        .map_err(|e| format!("PTY request failed: {e}"))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("Shell request failed: {e}"))?;

    session
        .channels
        .insert(channel_id.clone(), Arc::new(channel));

    Ok(channel_id)
}

/// Close a specific channel without disconnecting the session
#[tauri::command]
pub async fn ssh_close_channel(
    state: tauri::State<'_, SshState>,
    session_id: String,
    channel_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Session {session_id} not found"))?;

    if let Some(channel) = session.channels.remove(&channel_id) {
        let _ = channel.eof().await;
    }

    // Remove from channel_labels
    let mut labels = session.channel_labels.lock().await;
    labels.retain(|_, v| v != &channel_id);

    Ok(())
}

/// Write data to a specific SSH channel
#[tauri::command]
pub async fn ssh_write(
    state: tauri::State<'_, SshState>,
    id: String,
    channel_id: Option<String>,
    data: String,
) -> Result<(), String> {
    let ch_id = channel_id.unwrap_or_else(|| "default".to_string());
    let channel = {
        let sessions = state.sessions.lock().await;
        let session = sessions
            .get(&id)
            .ok_or_else(|| format!("Session {id} not found"))?;
        Arc::clone(
            session
                .channels
                .get(&ch_id)
                .ok_or_else(|| format!("Channel {ch_id} not found"))?,
        )
    };
    channel
        .data(data.as_bytes())
        .await
        .map_err(|e| format!("Write failed: {e}"))
}

/// Resize a specific SSH channel PTY
#[tauri::command]
pub async fn ssh_resize(
    state: tauri::State<'_, SshState>,
    id: String,
    channel_id: Option<String>,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let ch_id = channel_id.unwrap_or_else(|| "default".to_string());
    let channel = {
        let sessions = state.sessions.lock().await;
        let session = sessions
            .get(&id)
            .ok_or_else(|| format!("Session {id} not found"))?;
        Arc::clone(
            session
                .channels
                .get(&ch_id)
                .ok_or_else(|| format!("Channel {ch_id} not found"))?,
        )
    };
    channel
        .window_change(cols as u32, rows as u32, 0, 0)
        .await
        .map_err(|e| format!("Resize failed: {e}"))
}

/// Disconnect SSH session — closes all channels
#[tauri::command]
pub async fn ssh_disconnect(
    state: tauri::State<'_, SshState>,
    id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(session) = sessions.remove(&id) {
        // Close all channels
        for (_, channel) in session.channels {
            let _ = channel.eof().await;
        }
        let _ = session
            .handle
            .disconnect(Disconnect::ByApplication, "user disconnect", "en")
            .await;
    }
    Ok(())
}
