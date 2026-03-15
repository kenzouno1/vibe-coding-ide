use async_trait::async_trait;
use russh::client::{self, Handler};
use russh::{Channel, ChannelMsg, Disconnect};
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

pub(crate) struct SshClientHandler;

#[async_trait]
impl Handler for SshClientHandler {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Channel wrapped in Mutex — reader task calls wait(&mut), writers call data(&self)/etc
type SharedChannel = Arc<Mutex<Channel<client::Msg>>>;

pub struct SshSession {
    handle: client::Handle<SshClientHandler>,
    pub channels: HashMap<String, SharedChannel>,
    reader_handles: HashMap<String, tokio::task::JoinHandle<()>>,
    pub host: String,
    pub username: String,
}

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

/// Spawn reader task: locks channel to call wait(), emits output events
fn spawn_reader(
    channel: SharedChannel,
    app: AppHandle,
    session_id: String,
    label: String,
    output_tx: broadcast::Sender<(String, String, String)>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            // Lock only for the duration of wait() — releases between iterations
            let msg = { channel.lock().await.wait().await };
            match msg {
                Some(ChannelMsg::Data { data }) => {
                    let text = String::from_utf8_lossy(&data).to_string();
                    let _ = app.emit("ssh-output", SshOutput {
                        id: session_id.clone(),
                        channel_id: label.clone(),
                        data: text.clone(),
                    });
                    let _ = output_tx.send((session_id.clone(), label.clone(), text));
                }
                Some(ChannelMsg::ExtendedData { data, .. }) => {
                    let text = String::from_utf8_lossy(&data).to_string();
                    let _ = app.emit("ssh-output", SshOutput {
                        id: session_id.clone(),
                        channel_id: label.clone(),
                        data: text.clone(),
                    });
                    let _ = output_tx.send((session_id.clone(), label.clone(), text));
                }
                Some(ChannelMsg::Eof | ChannelMsg::Close) | None => break,
                _ => {}
            }
        }
    })
}

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
    let config = Arc::new(client::Config::default());

    let mut handle = client::connect(config, (host.as_str(), port), SshClientHandler)
        .await
        .map_err(|e| format!("SSH connect failed: {e}"))?;

    // Authenticate
    let auth_ok = match auth_method.as_str() {
        "password" => {
            let pw = password.as_deref().unwrap_or("");
            let ok = handle.authenticate_password(&username, pw).await
                .map_err(|e| format!("Auth failed: {e}"))?;
            if ok { true } else {
                use russh::client::KeyboardInteractiveAuthResponse;
                match handle.authenticate_keyboard_interactive_start(&username, None::<String>).await {
                    Ok(KeyboardInteractiveAuthResponse::Success) => true,
                    Ok(KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. }) => {
                        let resps: Vec<String> = prompts.iter().map(|_| pw.to_string()).collect();
                        matches!(
                            handle.authenticate_keyboard_interactive_respond(resps).await,
                            Ok(KeyboardInteractiveAuthResponse::Success)
                        )
                    }
                    _ => false,
                }
            }
        }
        "key" => {
            let key_path = private_key_path.as_deref().ok_or("Key path required")?;
            let raw = std::fs::read_to_string(key_path)
                .map_err(|e| format!("Read key failed: {e}"))?;
            let norm = raw.replace("\r\n", "\n");
            let norm = if norm.ends_with('\n') { norm } else { format!("{norm}\n") };
            let kp = russh_keys::decode_secret_key(&norm, password.as_deref())
                .map_err(|e| format!("Load key failed: {e}"))?;
            let kwa = russh_keys::key::PrivateKeyWithHashAlg::new(Arc::new(kp), None)
                .map_err(|e| format!("Key prep failed: {e}"))?;
            handle.authenticate_publickey(&username, kwa).await
                .map_err(|e| format!("Key auth failed: {e}"))?
        }
        _ => return Err(format!("Unknown auth: {auth_method}")),
    };
    if !auth_ok {
        return Err(format!("Auth failed for {username}@{host}:{port} ({auth_method})."));
    }

    // Open default channel
    let ch = handle.channel_open_session().await.map_err(|e| format!("Channel failed: {e}"))?;
    ch.request_pty(false, "xterm-256color", 80, 24, 0, 0, &[]).await.map_err(|e| format!("PTY failed: {e}"))?;
    ch.request_shell(false).await.map_err(|e| format!("Shell failed: {e}"))?;

    let shared_ch: SharedChannel = Arc::new(Mutex::new(ch));
    let reader = spawn_reader(Arc::clone(&shared_ch), app, id.clone(), "default".into(), state.output_tx.clone());

    let mut channels = HashMap::new();
    channels.insert("default".to_string(), shared_ch);
    let mut reader_handles = HashMap::new();
    reader_handles.insert("default".to_string(), reader);

    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(id.clone(), SshSession {
            handle, channels, reader_handles,
            host: host.clone(), username: username.clone(),
        });
    }
    Ok(id)
}

#[tauri::command]
pub async fn ssh_open_channel(
    state: tauri::State<'_, SshState>,
    app: AppHandle,
    session_id: String,
) -> Result<String, String> {
    let ch_label = uuid::Uuid::new_v4().to_string();
    let mut sessions = state.sessions.lock().await;
    let session = sessions.get_mut(&session_id)
        .ok_or_else(|| format!("Session {session_id} not found"))?;

    let ch = session.handle.channel_open_session().await.map_err(|e| format!("Channel failed: {e}"))?;
    ch.request_pty(false, "xterm-256color", 80, 24, 0, 0, &[]).await.map_err(|e| format!("PTY failed: {e}"))?;
    ch.request_shell(false).await.map_err(|e| format!("Shell failed: {e}"))?;

    let shared_ch: SharedChannel = Arc::new(Mutex::new(ch));
    let reader = spawn_reader(Arc::clone(&shared_ch), app, session_id.clone(), ch_label.clone(), state.output_tx.clone());

    session.channels.insert(ch_label.clone(), shared_ch);
    session.reader_handles.insert(ch_label.clone(), reader);
    Ok(ch_label)
}

#[tauri::command]
pub async fn ssh_close_channel(
    state: tauri::State<'_, SshState>,
    session_id: String,
    channel_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    let session = sessions.get_mut(&session_id)
        .ok_or_else(|| format!("Session {session_id} not found"))?;

    if let Some(ch) = session.channels.remove(&channel_id) {
        let _ = ch.lock().await.eof().await;
    }
    if let Some(rh) = session.reader_handles.remove(&channel_id) {
        rh.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_write(
    state: tauri::State<'_, SshState>,
    id: String,
    channel_id: Option<String>,
    data: String,
) -> Result<(), String> {
    let ch_id = channel_id.unwrap_or_else(|| "default".into());
    let ch = {
        let sessions = state.sessions.lock().await;
        let s = sessions.get(&id).ok_or_else(|| format!("Session {id} not found"))?;
        Arc::clone(s.channels.get(&ch_id).ok_or_else(|| format!("Channel {ch_id} not found"))?)
    };
    let result = ch.lock().await.data(&data.as_bytes()[..]).await
        .map_err(|e| format!("Write failed: {e}"));
    result
}

#[tauri::command]
pub async fn ssh_resize(
    state: tauri::State<'_, SshState>,
    id: String,
    channel_id: Option<String>,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let ch_id = channel_id.unwrap_or_else(|| "default".into());
    let ch = {
        let sessions = state.sessions.lock().await;
        let s = sessions.get(&id).ok_or_else(|| format!("Session {id} not found"))?;
        Arc::clone(s.channels.get(&ch_id).ok_or_else(|| format!("Channel {ch_id} not found"))?)
    };
    let result = ch.lock().await.window_change(cols as u32, rows as u32, 0, 0).await
        .map_err(|e| format!("Resize failed: {e}"));
    result
}

#[tauri::command]
pub async fn ssh_disconnect(
    state: tauri::State<'_, SshState>,
    id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(session) = sessions.remove(&id) {
        for (_, ch) in &session.channels {
            let _ = ch.lock().await.eof().await;
        }
        for (_, rh) in session.reader_handles {
            rh.abort();
        }
        let _ = session.handle.disconnect(Disconnect::ByApplication, "disconnect", "en").await;
    }
    Ok(())
}
