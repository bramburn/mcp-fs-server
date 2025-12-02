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
    // Triggers a search based on <qdrant-search> tags
    TriggerSearch {
        query: String,
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
    fn test_trigger_search_serialization() {
        let msg = OutputMessage::TriggerSearch {
            query: "test query".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"trigger_search""#));
        assert!(json.contains(r#""query":"test query""#));
    }
}