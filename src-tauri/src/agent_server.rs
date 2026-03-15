use crate::agent_protocol::{AgentRequest, AgentResponse};
use crate::ssh_manager::{SshSession, SessionInfo};
use futures_util::{SinkExt, StreamExt};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, Mutex};
use tokio_tungstenite::tungstenite::Message;

/// Shared state passed to agent server (avoids needing Arc<SshState>)
struct AgentState {
    sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    output_tx: broadcast::Sender<(String, String, String)>,
}

/// Start the agent WebSocket server with direct Arc refs
pub async fn start_agent_server_with_refs(
    sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    output_tx: broadcast::Sender<(String, String, String)>,
    token: String,
) {
    let ssh_state = Arc::new(AgentState { sessions, output_tx });
    // Try ports 9876-9880
    let mut listener = None;
    let mut bound_port = 0u16;
    for port in 9876..=9880 {
        match TcpListener::bind(format!("127.0.0.1:{port}")).await {
            Ok(l) => {
                bound_port = port;
                listener = Some(l);
                break;
            }
            Err(_) => continue,
        }
    }

    let listener = match listener {
        Some(l) => l,
        None => {
            log::error!("Agent server: could not bind to any port 9876-9880");
            return;
        }
    };

    // Write token + port to ~/.devtools/agent-token
    if let Err(e) = write_token_file(&token, bound_port) {
        log::error!("Agent server: failed to write token file: {e}");
    }

    log::info!("Agent WS server listening on 127.0.0.1:{bound_port}");

    while let Ok((stream, _addr)) = listener.accept().await {
        let ssh = Arc::clone(&ssh_state);
        let tok = token.clone();
        tokio::spawn(async move {
            let ws = match tokio_tungstenite::accept_async(stream).await {
                Ok(ws) => ws,
                Err(e) => {
                    log::warn!("WS handshake failed: {e}");
                    return;
                }
            };
            handle_client(ws, ssh, tok).await;
        });
    }
}

fn write_token_file(token: &str, port: u16) -> Result<(), String> {
    let dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".devtools");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let content = format!("{{\n  \"token\": \"{token}\",\n  \"port\": {port}\n}}");
    std::fs::write(dir.join("agent-token"), content).map_err(|e| e.to_string())
}

type WsStream = tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>;

async fn handle_client(ws: WsStream, ssh_state: Arc<AgentState>, token: String) {
    let (mut tx, mut rx) = ws.split();

    // Step 1: Wait for auth message
    let authenticated = loop {
        match rx.next().await {
            Some(Ok(Message::Text(text))) => {
                match serde_json::from_str::<AgentRequest>(&text) {
                    Ok(AgentRequest::Auth { token: t }) if t == token => {
                        let resp = serde_json::to_string(&AgentResponse::AuthOk).unwrap();
                        let _ = tx.send(Message::Text(resp.into())).await;
                        break true;
                    }
                    _ => {
                        let resp = serde_json::to_string(&AgentResponse::Error {
                            id: None,
                            message: "Invalid token or expected auth message".into(),
                        })
                        .unwrap();
                        let _ = tx.send(Message::Text(resp.into())).await;
                        break false;
                    }
                }
            }
            _ => break false,
        }
    };

    if !authenticated {
        return;
    }

    // Step 2: Handle commands, manage subscriptions
    let tx = Arc::new(Mutex::new(tx));
    let subscriptions: Arc<Mutex<HashSet<(String, String)>>> =
        Arc::new(Mutex::new(HashSet::new()));

    // Spawn output forwarder task
    let sub_clone = Arc::clone(&subscriptions);
    let tx_clone = Arc::clone(&tx);
    let mut output_rx = ssh_state.output_tx.subscribe();
    let forwarder = tokio::spawn(async move {
        while let Ok((sid, cid, data)) = output_rx.recv().await {
            let subs = sub_clone.lock().await;
            if subs.contains(&(sid.clone(), cid.clone())) {
                let resp = serde_json::to_string(&AgentResponse::Output {
                    session_id: sid,
                    channel_id: cid,
                    data,
                })
                .unwrap();
                let mut sender = tx_clone.lock().await;
                if sender.send(Message::Text(resp.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Message loop
    while let Some(Ok(msg)) = rx.next().await {
        let Message::Text(text) = msg else { continue };
        let req = match serde_json::from_str::<AgentRequest>(&text) {
            Ok(r) => r,
            Err(e) => {
                let resp = serde_json::to_string(&AgentResponse::Error {
                    id: None,
                    message: format!("Parse error: {e}"),
                })
                .unwrap();
                let mut sender = tx.lock().await;
                let _ = sender.send(Message::Text(resp.into())).await;
                continue;
            }
        };

        let response = match req {
            AgentRequest::Auth { .. } => AgentResponse::AuthOk,

            AgentRequest::ListSessions { id } => {
                let sessions = ssh_state.sessions.lock().await;
                let info: Vec<SessionInfo> = sessions
                    .iter()
                    .map(|(sid, s)| SessionInfo {
                        session_id: sid.clone(),
                        host: s.host.clone(),
                        username: s.username.clone(),
                        channels: s.channels.keys().cloned().collect(),
                    })
                    .collect();
                AgentResponse::Result {
                    id,
                    data: serde_json::to_value(info).unwrap_or_default(),
                }
            }

            AgentRequest::Write {
                id,
                session_id,
                channel_id,
                data,
            } => {
                let result = write_to_channel(&ssh_state, &session_id, &channel_id, &data).await;
                match result {
                    Ok(()) => AgentResponse::Result {
                        id,
                        data: serde_json::Value::String("ok".into()),
                    },
                    Err(e) => AgentResponse::Error {
                        id: Some(id),
                        message: e,
                    },
                }
            }

            AgentRequest::Subscribe {
                id,
                session_id,
                channel_id,
            } => {
                let mut subs = subscriptions.lock().await;
                subs.insert((session_id, channel_id));
                AgentResponse::Result {
                    id,
                    data: serde_json::Value::String("subscribed".into()),
                }
            }

            AgentRequest::Unsubscribe {
                id,
                session_id,
                channel_id,
            } => {
                let mut subs = subscriptions.lock().await;
                subs.remove(&(session_id, channel_id));
                AgentResponse::Result {
                    id,
                    data: serde_json::Value::String("unsubscribed".into()),
                }
            }

            AgentRequest::Execute {
                id,
                session_id,
                channel_id,
                command,
                timeout_ms,
                prompt_pattern,
            } => {
                let result = execute_command(
                    &ssh_state,
                    &session_id,
                    &channel_id,
                    &command,
                    timeout_ms,
                    prompt_pattern.as_deref(),
                )
                .await;
                match result {
                    Ok((output, timed_out)) => AgentResponse::Result {
                        id,
                        data: serde_json::json!({ "output": output, "timed_out": timed_out }),
                    },
                    Err(e) => AgentResponse::Error {
                        id: Some(id),
                        message: e,
                    },
                }
            }

            AgentRequest::OpenChannel { id, session_id } => {
                let result = open_channel(&ssh_state, &session_id).await;
                match result {
                    Ok(ch_id) => AgentResponse::Result {
                        id,
                        data: serde_json::json!({ "channel_id": ch_id }),
                    },
                    Err(e) => AgentResponse::Error {
                        id: Some(id),
                        message: e,
                    },
                }
            }

            AgentRequest::Resize {
                id,
                session_id,
                channel_id,
                rows,
                cols,
            } => {
                let result =
                    resize_channel(&ssh_state, &session_id, &channel_id, rows, cols).await;
                match result {
                    Ok(()) => AgentResponse::Result {
                        id,
                        data: serde_json::Value::String("ok".into()),
                    },
                    Err(e) => AgentResponse::Error {
                        id: Some(id),
                        message: e,
                    },
                }
            }
        };

        let resp = serde_json::to_string(&response).unwrap();
        let mut sender = tx.lock().await;
        if sender.send(Message::Text(resp.into())).await.is_err() {
            break;
        }
    }

    forwarder.abort();
}

/// Write to an SSH channel directly via SshState
async fn write_to_channel(
    state: &AgentState,
    session_id: &str,
    channel_id: &str,
    data: &str,
) -> Result<(), String> {
    let channel = {
        let sessions = state.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;
        Arc::clone(
            session
                .channels
                .get(channel_id)
                .ok_or_else(|| format!("Channel {channel_id} not found"))?,
        )
    };
    channel
        .data(data.as_bytes())
        .await
        .map_err(|e| format!("Write failed: {e}"))
}

/// Resize channel PTY
async fn resize_channel(
    state: &AgentState,
    session_id: &str,
    channel_id: &str,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let channel = {
        let sessions = state.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session {session_id} not found"))?;
        Arc::clone(
            session
                .channels
                .get(channel_id)
                .ok_or_else(|| format!("Channel {channel_id} not found"))?,
        )
    };
    channel
        .window_change(cols as u32, rows as u32, 0, 0)
        .await
        .map_err(|e| format!("Resize failed: {e}"))
}

/// Open a new channel on an existing session
async fn open_channel(state: &AgentState, session_id: &str) -> Result<String, String> {
    let channel_id = uuid::Uuid::new_v4().to_string();
    let mut sessions = state.sessions.lock().await;
    let session = sessions
        .get_mut(session_id)
        .ok_or_else(|| format!("Session {session_id} not found"))?;

    let channel = session
        .handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Channel open failed: {e}"))?;

    {
        let mut labels = session.channel_labels.lock().await;
        labels.insert(channel.id(), channel_id.clone());
    }

    channel
        .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
        .await
        .map_err(|e| format!("PTY failed: {e}"))?;
    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("Shell failed: {e}"))?;

    session
        .channels
        .insert(channel_id.clone(), Arc::new(channel));
    Ok(channel_id)
}

/// Execute a command: write it, collect output until prompt detected or timeout
async fn execute_command(
    state: &AgentState,
    session_id: &str,
    channel_id: &str,
    command: &str,
    timeout_ms: u64,
    prompt_pattern: Option<&str>,
) -> Result<(String, bool), String> {
    // Subscribe to output before sending command
    let mut output_rx = state.output_tx.subscribe();

    // Send command
    write_to_channel(state, session_id, channel_id, &format!("{command}\n")).await?;

    let pattern = prompt_pattern.unwrap_or(r"[\$#>]\s*$");
    let re = regex::Regex::new(pattern).map_err(|e| format!("Bad regex: {e}"))?;

    let mut collected = String::new();
    let deadline = tokio::time::Instant::now()
        + tokio::time::Duration::from_millis(timeout_ms);

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Ok((collected, true)); // timed out
        }

        match tokio::time::timeout(remaining, output_rx.recv()).await {
            Ok(Ok((sid, cid, data))) => {
                if sid == session_id && cid == channel_id {
                    collected.push_str(&data);
                    if re.is_match(&collected) {
                        return Ok((collected, false));
                    }
                }
            }
            Ok(Err(_)) => break, // broadcast closed
            Err(_) => return Ok((collected, true)), // timeout
        }
    }

    Ok((collected, true))
}
