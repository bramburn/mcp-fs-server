use serde::Serialize;

/// Messages sent from the Rust clipboard monitor to the VS Code extension.
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutputMessage {
    ClipboardUpdate {
        content: String,
        timestamp: i64,
        length: usize,
    },
    Error {
        message: String,
    },
    Ready,
}