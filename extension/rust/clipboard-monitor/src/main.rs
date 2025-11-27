use anyhow::Result;
use arboard::Clipboard;
use chrono::Utc;
use md5;
use std::io::{self, Write};
use std::thread;
use std::time::Duration;

mod protocol;
use protocol::OutputMessage;

// --- Logic Extraction for Testing ---

/// Calculates hash and returns a message if the content is new.
/// Returns None if the content is unchanged (hash match).
fn process_clipboard_content(
    content: String,
    last_hash: &Option<String>,
) -> (Option<OutputMessage>, String) {
    let digest = md5::compute(content.as_bytes());
    let current_hash = format!("{:x}", digest);

    if last_hash.as_deref() != Some(&current_hash) {
        let message = OutputMessage::ClipboardUpdate {
            length: content.len(),
            content,
            timestamp: Utc::now().to_rfc3339(),
        };
        return (Some(message), current_hash);
    }

    (None, current_hash)
}

fn send_json(msg: &OutputMessage) -> Result<()> {
    let json = serde_json::to_string(msg)?;
    let mut out = io::stdout();
    out.write_all(json.as_bytes())?;
    out.write_all(b"\n")?;
    out.flush()?;
    Ok(())
}

fn main() -> Result<()> {
    // 1. Initialize Windows Clipboard
    let mut clipboard = match Clipboard::new() {
        Ok(cb) => cb,
        Err(e) => {
            let _ = send_json(&OutputMessage::Error {
                message: format!("Failed to init Windows clipboard: {}", e),
            });
            return Err(anyhow::anyhow!(e));
        }
    };

    // 2. Signal Ready
    send_json(&OutputMessage::Ready)?;

    let mut last_hash: Option<String> = None;

    // 3. Main Polling Loop
    loop {
        thread::sleep(Duration::from_millis(500));

        match clipboard.get_text() {
            Ok(content) => {
                let (message, new_hash) = process_clipboard_content(content, &last_hash);

                if let Some(msg) = message {
                    let _ = send_json(&msg);
                    last_hash = Some(new_hash);
                }
            }
            Err(_) => {
                // Ignore transient clipboard errors (locking, etc)
            }
        }
    }
}

// --- Unit Tests ---
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_new_content() {
        let content = "Test Data".to_string();
        let last_hash = None;

        let (msg, new_hash) = process_clipboard_content(content.clone(), &last_hash);

        // Should return a message
        assert!(msg.is_some());

        if let Some(OutputMessage::ClipboardUpdate {
            length,
            content: c,
            ..
        }) = msg
        {
            assert_eq!(length, 9);
            assert_eq!(c, "Test Data");
        } else {
            panic!("Wrong message type returned");
        }

        // Hash should be valid MD5
        assert_eq!(new_hash.len(), 32);
    }

    #[test]
    fn test_process_duplicate_content() {
        let content = "Test Data".to_string();

        // 1. First pass
        let (_, hash1) = process_clipboard_content(content.clone(), &None);

        // 2. Second pass (simulate loop)
        let (msg, hash2) = process_clipboard_content(content.clone(), &Some(hash1.clone()));

        // Should NOT return a message (duplicate)
        assert!(msg.is_none());
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_process_changed_content() {
        let (_, hash1) = process_clipboard_content("A".to_string(), &None);
        let (msg, hash2) = process_clipboard_content("B".to_string(), &Some(hash1.clone()));

        assert!(msg.is_some());
        assert_ne!(hash1, hash2);
    }
}