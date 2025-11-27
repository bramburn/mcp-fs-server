use serde::Serialize;

/// Messages sent from the Rust clipboard monitor to the VS Code extension.
#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutputMessage {
    ClipboardUpdate {
        content: String,
        timestamp: String,
        length: usize,
    },
    Error {
        message: String,
    },
    Ready,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn test_ready_serialization() {
        let msg = OutputMessage::Ready;
        let json = serde_json::to_string(&msg).unwrap();
        assert_eq!(json, r#"{"type":"ready"}"#);
    }

    #[test]
    fn test_error_serialization() {
        let msg = OutputMessage::Error {
            message: "Test Error".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert_eq!(json, r#"{"type":"error","message":"Test Error"}"#);
    }

    #[test]
    fn test_update_serialization() {
        let msg = OutputMessage::ClipboardUpdate {
            content: "hello".to_string(),
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            length: 5,
        };
        let json = serde_json::to_string(&msg).unwrap();

        // verify structure
        assert!(json.contains(r#""type":"clipboard_update""#));
        assert!(json.contains(r#""content":"hello""#));
        assert!(json.contains(r#""length":5"#));
    }
}