use serde::{Deserialize, Serialize};

/// Incoming messages from agent WS clients
#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
pub enum AgentRequest {
    #[serde(rename = "auth")]
    Auth { token: String },

    #[serde(rename = "list_sessions")]
    ListSessions { id: u64 },

    #[serde(rename = "write")]
    Write {
        id: u64,
        session_id: String,
        channel_id: String,
        data: String,
    },

    #[serde(rename = "subscribe")]
    Subscribe {
        id: u64,
        session_id: String,
        channel_id: String,
    },

    #[serde(rename = "unsubscribe")]
    Unsubscribe {
        id: u64,
        session_id: String,
        channel_id: String,
    },

    #[serde(rename = "execute")]
    Execute {
        id: u64,
        session_id: String,
        channel_id: String,
        command: String,
        timeout_ms: u64,
        prompt_pattern: Option<String>,
    },

    #[serde(rename = "open_channel")]
    #[allow(dead_code)]
    OpenChannel { id: u64, session_id: String },

    #[serde(rename = "resize")]
    Resize {
        id: u64,
        session_id: String,
        channel_id: String,
        rows: u16,
        cols: u16,
    },
}

/// Outgoing messages to agent WS clients
#[derive(Serialize, Debug)]
#[serde(tag = "type")]
pub enum AgentResponse {
    #[serde(rename = "auth_ok")]
    AuthOk,

    #[serde(rename = "result")]
    Result {
        id: u64,
        data: serde_json::Value,
    },

    #[serde(rename = "output")]
    Output {
        session_id: String,
        channel_id: String,
        data: String,
    },

    #[serde(rename = "error")]
    Error {
        id: Option<u64>,
        message: String,
    },

    #[serde(rename = "denied")]
    Denied {
        id: u64,
        command: String,
        reason: String,
    },
}
