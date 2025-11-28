use anyhow::{Result};
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
    // 1. Initialize Clipboard with OS-specific error context
    let mut clipboard = match Clipboard::new() {
        Ok(cb) => cb,
        Err(e) => {
            let error_msg = if cfg!(target_os = "linux") {
                format!("Failed to init Linux clipboard (Check X11/Wayland support): {}", e)
            } else if cfg!(target_os = "macos") {
                format!("Failed to init MacOS clipboard (Check permissions): {}", e)
            } else {
                format!("Failed to init Clipboard: {}", e)
            };

            let _ = send_json(&OutputMessage::Error {
                message: error_msg.clone(),
            });
            return Err(anyhow::anyhow!(error_msg));
        }
    };

    // 2. Signal Ready
    send_json(&OutputMessage::Ready)?;

    let mut last_hash: Option<String> = None;

    // 3. Main Polling Loop
    loop {
        // 500ms is a good balance between responsiveness and CPU usage 
        // across Mac/Linux/Windows
        thread::sleep(Duration::from_millis(500));

        match clipboard.get_text() {
            Ok(content) => {
                let (message, new_hash) = process_clipboard_content(content, &last_hash);

                if let Some(msg) = message {
                    if let Err(e) = send_json(&msg) {
                        // If stdout fails (e.g., parent process died), exit.
                        eprintln!("Failed to send message: {}", e);
                        break;
                    }
                    last_hash = Some(new_hash);
                }
            }
            Err(arboard::Error::ContentNotAvailable) => {
                // Common on some OSs when non-text is copied. Ignore.
            }
            Err(_) => {
                // Ignore transient clipboard errors (locking, etc)
            }
        }
    }

    Ok(())
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

        assert!(msg.is_some());
        assert_eq!(new_hash.len(), 32);
    }

    #[test]
    fn test_process_duplicate_content() {
        let content = "Test Data".to_string();
        let (_, hash1) = process_clipboard_content(content.clone(), &None);
        let (msg, hash2) = process_clipboard_content(content.clone(), &Some(hash1.clone()));

        assert!(msg.is_none());
        assert_eq!(hash1, hash2);
    }
}