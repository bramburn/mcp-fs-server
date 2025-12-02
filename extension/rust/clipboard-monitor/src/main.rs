use anyhow::{Result};
use arboard::Clipboard;
use chrono::Utc;
use md5;
use regex::Regex;
use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

mod protocol;
use protocol::{OutputMessage, InputCommand};

/// Determines the polling state: true for active, false for paused.
static IS_MONITORING_ACTIVE: Arc<Mutex<bool>> = Arc::new(Mutex::new(true));

/// Regex for robustly detecting any qdrant XML command, capturing the entire tag block.
/// (?s) enables dotall mode so that '.' matches newlines.
const XML_COMMAND_REGEX: &str = r"(?s)(<qdrant-(file|search|read).*?>(.*?)</qdrant-\2>|<qdrant-(file|search|read).*?/>)";

/// Checks for special XML tags in content and returns specific trigger messages.
fn check_for_triggers(content: &str) -> Option<OutputMessage> {
    let re = Regex::new(XML_COMMAND_REGEX).unwrap();
    
    let xml_payloads: Vec<String> = re.find_iter(content)
        .map(|m| m.as_str().to_string())
        .collect();

    if !xml_payloads.is_empty() {
        return Some(OutputMessage::TriggerXml {
            xml_payloads,
        });
    }

    None
}

/// Calculates hash and returns a message if the content is new.
fn process_clipboard_content(
    content: String,
    last_hash: &Option<String>,
) -> (Option<OutputMessage>, Option<OutputMessage>, String) {
    let digest = md5::compute(content.as_bytes());
    let current_hash = format!("{:x}", digest);

    // If identical to last hash, do nothing
    if last_hash.as_deref() == Some(&current_hash) {
        return (None, None, current_hash);
    }

    // 1. Generate Standard Update Message
    let update_msg = Some(OutputMessage::ClipboardUpdate {
        length: content.len(),
        content: content.clone(),
        timestamp: Utc::now().to_rfc3339(),
    });

    // 2. Check for triggers (XML commands)
    let trigger_msg = check_for_triggers(&content);

    (update_msg, trigger_msg, current_hash)
}

fn send_json(msg: &OutputMessage) -> Result<()> {
    let json = serde_json::to_string(msg)?;
    let mut out = io::stdout();
    out.write_all(json.as_bytes())?;
    out.write_all(b"\n")?;
    out.flush()?;
    Ok(())
}

/// Thread dedicated to listening for commands from the extension via stdin.
fn input_listener() {
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        match line {
            Ok(json_line) => {
                match serde_json::from_str::<InputCommand>(&json_line) {
                    Ok(cmd) => {
                        let mut monitoring = IS_MONITORING_ACTIVE.lock().unwrap();
                        match cmd {
                            InputCommand::Pause => {
                                *monitoring = false;
                                // Optional: Send confirmation back to TS
                                // let _ = send_json(&OutputMessage::Ready);
                            }
                            InputCommand::Resume => {
                                *monitoring = true;
                                // Optional: Send confirmation back to TS
                                // let _ = send_json(&OutputMessage::Ready);
                            }
                        }
                    }
                    Err(e) => {
                        let error_msg = format!("Rust Input Parsing Error: {} | Raw: {}", e, json_line);
                        // Log error internally, don't flood stdout as that disrupts main flow
                        eprintln!("{}", error_msg);
                    }
                }
            }
            Err(e) => {
                eprintln!("Rust Input Read Error: {}", e);
                break; // Exit loop on read error (e.g., pipe closed)
            }
        }
    }
}

fn main() -> Result<()> {
    // 1. Initialize Clipboard
    let mut clipboard = match Clipboard::new() {
        Ok(cb) => cb,
        Err(e) => {
            let error_msg = format!("Failed to init Clipboard: {}", e);
            let _ = send_json(&OutputMessage::Error {
                message: error_msg.clone(),
            });
            return Err(anyhow::anyhow!(error_msg));
        }
    };

    // 2. Start input listener thread
    thread::spawn(input_listener);

    // 3. Signal Ready
    send_json(&OutputMessage::Ready)?;

    let mut last_hash: Option<String> = None;

    // 4. Main Polling Loop
    loop {
        thread::sleep(Duration::from_millis(500));
        
        // Check if monitoring is paused
        if !*IS_MONITORING_ACTIVE.lock().unwrap() {
             thread::sleep(Duration::from_secs(1)); // Sleep longer while paused
             continue;
        }

        match clipboard.get_text() {
            Ok(content) => {
                let (update_msg, trigger_msg, new_hash) = process_clipboard_content(content, &last_hash);

                if let Some(msg) = update_msg {
                    if let Err(_) = send_json(&msg) { break; }
                }

                // If a trigger was found (XML commands), send it immediately after the update
                if let Some(msg) = trigger_msg {
                    if let Err(_) = send_json(&msg) { break; }
                }

                last_hash = Some(new_hash);
            }
            Err(_) => {
                // Ignore transient errors
            }
        }
    }

    Ok(())
}