use anyhow::Result;
mod protocol;
use arboard::Clipboard;
use protocol::OutputMessage;
use std::io::{self, Write};
use std::time::Duration;
use std::thread;
use chrono::Utc;
use md5;

fn send_json(msg: &OutputMessage) -> Result<()> {
    let json = serde_json::to_string(msg)?;
    // Write JSON followed by a newline to stdout and flush using std::io
    let mut out = io::stdout();
    out.write_all(json.as_bytes())?;
    out.write_all(b"\n")?;
    out.flush()?;
    Ok(())
}

fn main() -> Result<()> {
    // Initialize clipboard with graceful error handling
    let mut clipboard = match Clipboard::new() {
        Ok(cb) => cb,
        Err(e) => {
            // Send an Error message according to the protocol
            let err = OutputMessage::Error {
                message: format!("Failed to initialize clipboard: {}", e),
            };
            let _ = send_json(&err);
            // Exit with error
            return Err(anyhow::anyhow!(e));
        }
    };
 
    // Send Ready message on startup (unit variant)
    let _ = send_json(&OutputMessage::Ready)?;
 
    // Polling loop
    let mut last_hash: Option<String> = None;
 
    loop {
        // Sleep for the polling interval (500ms)
        thread::sleep(Duration::from_millis(500));
 
        // Attempt to read clipboard text
        match clipboard.get_text() {
            Ok(text) => {
                // Compute md5 hash to detect changes
                let digest = md5::compute(text.as_bytes());
                let hash = format!("{:x}", digest);
 
                if Some(hash.clone()) != last_hash {
                    last_hash = Some(hash);
 
                    let msg = OutputMessage::ClipboardUpdate {
                        content: text.clone(),
                        timestamp: Utc::now().timestamp(),
                        length: text.len(),
                    };
 
                    if let Err(e) = send_json(&msg) {
                        // If writing to stdout fails, log to stderr and continue
                        eprintln!("Failed to send json: {}", e);
                    }
                }
            }
            Err(e) => {
                // Send an error message but keep running (use Error variant)
                let err_msg = OutputMessage::Error {
                    message: format!("Failed to read clipboard: {}", e),
                };
                if let Err(e) = send_json(&err_msg) {
                    eprintln!("Failed to send error json: {}", e);
                }
            }
        }
    }
}