use async_trait::async_trait;
use russh::client::{self, Handler};
use russh::Disconnect;
use russh_keys::ssh_key::PublicKey;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt, WriteHalf};
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

/// Write half of a channel stream — used for sending data and is Send + Sync
type ChannelWriter = Arc<Mutex<WriteHalf<russh::ChannelStream<client::Msg>>>>;

pub struct SshSession {
    handle: client::Handle<SshClientHandler>,
    /// channel_label → writer half for sending data
    pub channels: HashMap<String, ChannelWriter>,
    /// reader task handles for cleanup
    readers: HashMap<String, tokio::task::JoinHandle<()>>,
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

/// Open a channel, request PTY+shell, split into reader task + writer.
/// Returns the writer half and the reader task handle.
async fn setup_channel(
    handle: &client::Handle<SshClientHandler>,
    app: &AppHandle,
    session_id: &str,
    label: &str,
    output_tx: &broadcast::Sender<(String, String, String)>,
) -> Result<(ChannelWriter, tokio::task::JoinHandle<()>), String> {
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Channel open failed: {e}"))?;

    channel
        .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
        .await
        .map_err(|e| format!("PTY failed: {e}"))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("Shell failed: {e}"))?;

    log::info!("SSH channel ready: session={session_id}, label={label}");
    // Split channel into AsyncRead + AsyncWrite halves
    let stream = channel.into_stream();
    let (read_half, write_half) = tokio::io::split(stream);

    let writer: ChannelWriter = Arc::new(Mutex::new(write_half));

    // Spawn reader task
    let sid = session_id.to_string();
    let lbl = label.to_string();
    let app_clone = app.clone();
    let otx = output_tx.clone();

    let reader_handle = tokio::spawn(async move {
        // Wait for frontend to mount terminal component and setup event listener
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        log::info!("SSH reader started: session={sid}, channel={lbl}");
        let mut reader = read_half;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf).await {
                Ok(0) => {
                    log::info!("SSH reader EOF: session={sid}, channel={lbl}");
                    break;
                }
                Ok(n) => {
                    log::info!("SSH reader got {n} bytes: session={sid}, channel={lbl}");
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(
                        "ssh-output",
                        SshOutput {
                            id: sid.clone(),
                            channel_id: lbl.clone(),
                            data: text.clone(),
                        },
                    );
                    let _ = otx.send((sid.clone(), lbl.clone(), text));
                }
                Err(e) => {
                    log::error!("SSH reader error: {e}, session={sid}, channel={lbl}");
                    break;
                }
            }
        }
    });

    Ok((writer, reader_handle))
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

    let mut handle =
        client::connect(config, (host.as_str(), port), SshClientHandler)
            .await
            .map_err(|e| format!("SSH connect failed: {e}"))?;

    // Authenticate
    let auth_ok = match auth_method.as_str() {
        "password" => {
            let pw = password.as_deref().unwrap_or("");
            let ok = handle
                .authenticate_password(&username, pw)
                .await
                .map_err(|e| format!("Auth failed: {e}"))?;
            if ok {
                true
            } else {
                use russh::client::KeyboardInteractiveAuthResponse;
                match handle
                    .authenticate_keyboard_interactive_start(&username, None::<String>)
                    .await
                {
                    Ok(KeyboardInteractiveAuthResponse::Success) => true,
                    Ok(KeyboardInteractiveAuthResponse::InfoRequest {
                        prompts, ..
                    }) => {
                        let resps: Vec<String> =
                            prompts.iter().map(|_| pw.to_string()).collect();
                        matches!(
                            handle
                                .authenticate_keyboard_interactive_respond(resps)
                                .await,
                            Ok(KeyboardInteractiveAuthResponse::Success)
                        )
                    }
                    _ => false,
                }
            }
        }
        "key" => {
            let kp = private_key_path.as_deref().ok_or("Key path required")?;
            let raw =
                std::fs::read_to_string(kp).map_err(|e| format!("Read key: {e}"))?;
            let norm = raw.replace("\r\n", "\n");
            let norm = if norm.ends_with('\n') {
                norm
            } else {
                format!("{norm}\n")
            };
            let key = russh_keys::decode_secret_key(&norm, password.as_deref())
                .map_err(|e| format!("Load key: {e}"))?;
            let kwa =
                russh_keys::key::PrivateKeyWithHashAlg::new(Arc::new(key), None)
                    .map_err(|e| format!("Key prep: {e}"))?;
            handle
                .authenticate_publickey(&username, kwa)
                .await
                .map_err(|e| format!("Key auth: {e}"))?
        }
        _ => return Err(format!("Unknown auth: {auth_method}")),
    };
    if !auth_ok {
        return Err(format!(
            "Auth failed for {username}@{host}:{port} ({auth_method})."
        ));
    }

    // Open default channel
    let (writer, reader) =
        setup_channel(&handle, &app, &id, "default", &state.output_tx).await?;

    let mut channels = HashMap::new();
    channels.insert("default".to_string(), writer);
    let mut readers = HashMap::new();
    readers.insert("default".to_string(), reader);

    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(
            id.clone(),
            SshSession {
                handle,
                channels,
                readers,
                host: host.clone(),
                username: username.clone(),
            },
        );
    }
    Ok(id)
}

#[tauri::command]
pub async fn ssh_open_channel(
    state: tauri::State<'_, SshState>,
    app: AppHandle,
    session_id: String,
) -> Result<String, String> {
    let label = uuid::Uuid::new_v4().to_string();
    let mut sessions = state.sessions.lock().await;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Session {session_id} not found"))?;

    let (writer, reader) = setup_channel(
        &session.handle,
        &app,
        &session_id,
        &label,
        &state.output_tx,
    )
    .await?;

    session.channels.insert(label.clone(), writer);
    session.readers.insert(label.clone(), reader);
    Ok(label)
}

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

    if let Some(writer) = session.channels.remove(&channel_id) {
        let _ = writer.lock().await.shutdown().await;
    }
    if let Some(rh) = session.readers.remove(&channel_id) {
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
    let writer = {
        let sessions = state.sessions.lock().await;
        let s = sessions
            .get(&id)
            .ok_or_else(|| format!("Session {id} not found"))?;
        Arc::clone(
            s.channels
                .get(&ch_id)
                .ok_or_else(|| format!("Channel {ch_id} not found"))?,
        )
    };
    let result = writer
        .lock()
        .await
        .write_all(data.as_bytes())
        .await
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
    // Resize goes through Handle — not through the stream
    // ChannelStream doesn't expose window_change, so we skip resize for now.
    // The PTY was opened with 80x24, xterm will handle display regardless.
    // TODO: implement resize via raw SSH channel request if needed
    Ok(())
}

#[tauri::command]
pub async fn ssh_disconnect(
    state: tauri::State<'_, SshState>,
    id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(session) = sessions.remove(&id) {
        for (_, w) in &session.channels {
            let _ = w.lock().await.shutdown().await;
        }
        for (_, rh) in session.readers {
            rh.abort();
        }
        let _ = session
            .handle
            .disconnect(Disconnect::ByApplication, "disconnect", "en")
            .await;
    }
    Ok(())
}
