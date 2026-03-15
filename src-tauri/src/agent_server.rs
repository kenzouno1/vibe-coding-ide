use crate::agent_protocol::{AgentRequest, AgentResponse};
use crate::ssh_manager::{SshSession, SessionInfo};
use futures_util::{SinkExt, StreamExt};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, Mutex};
use tokio_tungstenite::tungstenite::Message;

struct AgentState {
    sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    output_tx: broadcast::Sender<(String, String, String)>,
}

pub async fn start_agent_server_with_refs(
    sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    output_tx: broadcast::Sender<(String, String, String)>,
    token: String,
) {
    let state = Arc::new(AgentState { sessions, output_tx });
    let mut bound_port = 0u16;
    let mut listener = None;
    for port in 9876..=9880 {
        if let Ok(l) = TcpListener::bind(format!("127.0.0.1:{port}")).await {
            bound_port = port;
            listener = Some(l);
            break;
        }
    }
    let listener = match listener {
        Some(l) => l,
        None => { log::error!("Agent server: no port available"); return; }
    };
    let _ = write_token_file(&token, bound_port);
    log::info!("Agent WS on 127.0.0.1:{bound_port}");

    while let Ok((stream, _)) = listener.accept().await {
        let s = Arc::clone(&state);
        let t = token.clone();
        tokio::spawn(async move {
            if let Ok(ws) = tokio_tungstenite::accept_async(stream).await {
                handle_client(ws, s, t).await;
            }
        });
    }
}

fn write_token_file(token: &str, port: u16) -> Result<(), String> {
    let dir = dirs::home_dir().unwrap_or_default().join(".devtools");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let c = format!("{{\"token\":\"{token}\",\"port\":{port}}}");
    std::fs::write(dir.join("agent-token"), c).map_err(|e| e.to_string())
}

type Ws = tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>;

async fn handle_client(ws: Ws, state: Arc<AgentState>, token: String) {
    let (mut tx, mut rx) = ws.split();

    // Auth
    let ok = loop {
        match rx.next().await {
            Some(Ok(Message::Text(t))) => match serde_json::from_str::<AgentRequest>(&t) {
                Ok(AgentRequest::Auth { token: t }) if t == token => {
                    let _ = tx.send(Message::Text(serde_json::to_string(&AgentResponse::AuthOk).unwrap().into())).await;
                    break true;
                }
                _ => {
                    let _ = tx.send(Message::Text(serde_json::to_string(&AgentResponse::Error { id: None, message: "Bad token".into() }).unwrap().into())).await;
                    break false;
                }
            },
            _ => break false,
        }
    };
    if !ok { return; }

    let tx = Arc::new(Mutex::new(tx));
    let subs: Arc<Mutex<HashSet<(String, String)>>> = Arc::new(Mutex::new(HashSet::new()));

    // Output forwarder
    let sc = Arc::clone(&subs);
    let tc = Arc::clone(&tx);
    let mut orx = state.output_tx.subscribe();
    let fwd = tokio::spawn(async move {
        while let Ok((sid, cid, data)) = orx.recv().await {
            if sc.lock().await.contains(&(sid.clone(), cid.clone())) {
                let r = serde_json::to_string(&AgentResponse::Output { session_id: sid, channel_id: cid, data }).unwrap();
                if tc.lock().await.send(Message::Text(r.into())).await.is_err() { break; }
            }
        }
    });

    while let Some(Ok(msg)) = rx.next().await {
        let Message::Text(text) = msg else { continue };
        let req = match serde_json::from_str::<AgentRequest>(&text) {
            Ok(r) => r,
            Err(e) => {
                let r = serde_json::to_string(&AgentResponse::Error { id: None, message: format!("Parse: {e}") }).unwrap();
                let _ = tx.lock().await.send(Message::Text(r.into())).await;
                continue;
            }
        };

        let resp = match req {
            AgentRequest::Auth { .. } => AgentResponse::AuthOk,
            AgentRequest::ListSessions { id } => {
                let s = state.sessions.lock().await;
                let info: Vec<SessionInfo> = s.iter().map(|(sid, ss)| SessionInfo {
                    session_id: sid.clone(), host: ss.host.clone(), username: ss.username.clone(),
                    channels: ss.channels.keys().cloned().collect(),
                }).collect();
                AgentResponse::Result { id, data: serde_json::to_value(info).unwrap_or_default() }
            }
            AgentRequest::Write { id, session_id, channel_id, data } => {
                match write_ch(&state, &session_id, &channel_id, &data).await {
                    Ok(()) => AgentResponse::Result { id, data: "ok".into() },
                    Err(e) => AgentResponse::Error { id: Some(id), message: e },
                }
            }
            AgentRequest::Subscribe { id, session_id, channel_id } => {
                subs.lock().await.insert((session_id, channel_id));
                AgentResponse::Result { id, data: "subscribed".into() }
            }
            AgentRequest::Unsubscribe { id, session_id, channel_id } => {
                subs.lock().await.remove(&(session_id, channel_id));
                AgentResponse::Result { id, data: "unsubscribed".into() }
            }
            AgentRequest::Execute { id, session_id, channel_id, command, timeout_ms, prompt_pattern } => {
                match exec_cmd(&state, &session_id, &channel_id, &command, timeout_ms, prompt_pattern.as_deref()).await {
                    Ok((out, to)) => AgentResponse::Result { id, data: serde_json::json!({"output": out, "timed_out": to}) },
                    Err(e) => AgentResponse::Error { id: Some(id), message: e },
                }
            }
            AgentRequest::OpenChannel { id, .. } => {
                AgentResponse::Error { id: Some(id), message: "Use UI to open channels".into() }
            }
            AgentRequest::Resize { id, session_id, channel_id, rows, cols } => {
                match resize_ch(&state, &session_id, &channel_id, rows, cols).await {
                    Ok(()) => AgentResponse::Result { id, data: "ok".into() },
                    Err(e) => AgentResponse::Error { id: Some(id), message: e },
                }
            }
        };
        let r = serde_json::to_string(&resp).unwrap();
        if tx.lock().await.send(Message::Text(r.into())).await.is_err() { break; }
    }
    fwd.abort();
}

async fn write_ch(state: &AgentState, sid: &str, cid: &str, data: &str) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    let writer = {
        let sessions = state.sessions.lock().await;
        let s = sessions.get(sid).ok_or("Session not found")?;
        Arc::clone(s.channels.get(cid).ok_or("Channel not found")?)
    };
    let r = writer.lock().await.write_all(data.as_bytes()).await.map_err(|e| format!("{e}"));
    r
}

async fn resize_ch(state: &AgentState, _sid: &str, _cid: &str, _rows: u16, _cols: u16) -> Result<(), String> {
    // Resize not available via ChannelStream — PTY opened with default size
    Ok(())
}

async fn exec_cmd(state: &AgentState, sid: &str, cid: &str, cmd: &str, timeout_ms: u64, pat: Option<&str>) -> Result<(String, bool), String> {
    let mut orx = state.output_tx.subscribe();
    write_ch(state, sid, cid, &format!("{cmd}\n")).await?;
    let re = regex::Regex::new(pat.unwrap_or(r"[\$#>]\s*$")).map_err(|e| format!("{e}"))?;
    let mut out = String::new();
    let dl = tokio::time::Instant::now() + tokio::time::Duration::from_millis(timeout_ms);
    loop {
        let rem = dl.saturating_duration_since(tokio::time::Instant::now());
        if rem.is_zero() { return Ok((out, true)); }
        match tokio::time::timeout(rem, orx.recv()).await {
            Ok(Ok((s, c, d))) if s == sid && c == cid => {
                out.push_str(&d);
                if re.is_match(&out) { return Ok((out, false)); }
            }
            Ok(Err(_)) => break,
            Err(_) => return Ok((out, true)),
            _ => {}
        }
    }
    Ok((out, true))
}
