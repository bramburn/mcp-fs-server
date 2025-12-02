use serde::Serialize;

/// Messages sent from the Rust clipboard monitor to the VS Code extension.
#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutputMessage {
    /// Standard update message, used to populate the history list.
    ClipboardUpdate {
        content: String,
        timestamp: String,
        length: usize,
    },
    /// Triggered when one or more XML commands are detected in the clipboard.
    TriggerXml {
        xml_payloads: Vec<String>,
    },
    Error {
        message: String,
    },
    Ready,
}

/// Commands sent from the VS Code extension to the Rust clipboard monitor.
#[derive(Debug, serde::Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum InputCommand {
    /// Command to temporarily stop the clipboard polling loop.
    Pause,
    /// Command to resume the clipboard polling loop.
    Resume,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn test_trigger_xml_serialization() {
        let msg = OutputMessage::TriggerXml {
            xml_payloads: vec![
                "<qdrant-file path=\"a.ts\" action=\"create\"></qdrant-file>".to_string(),
                "<qdrant-search>query</qdrant-search>".to_string(),
            ],
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"trigger_xml""#));
        assert!(json.contains(r#""xml_payloads":""#));
    }
}