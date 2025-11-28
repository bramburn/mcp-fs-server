use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::env;

// Helper to compile binary before tests run
fn compile_binary() {
    let status = Command::new("cargo")
        .arg("build")
        .arg("--release")
        .status()
        .expect("Failed to build binary for tests");
    assert!(status.success());
}

#[test]
fn test_binary_starts_and_emits_ready() {
    compile_binary();

    // Cross-platform binary path construction
    let mut target_path = PathBuf::from("target/release/clipboard-monitor");
    
    // Automatically appends .exe on Windows, does nothing on Mac/Linux
    target_path.set_extension(env::consts::EXE_EXTENSION);

    // Ensure the binary exists before trying to run it
    assert!(target_path.exists(), "Binary not found at {:?}", target_path);

    let mut child = Command::new(target_path)
        .stdout(Stdio::piped())
        .spawn()
        .expect("Failed to start child process");

    let stdout = child.stdout.take().expect("Failed to open stdout");
    let mut reader = BufReader::new(stdout);

    // Read the first line. It SHOULD be the "Ready" message.
    let mut line = String::new();
    reader.read_line(&mut line).expect("Failed to read line");

    // Clean up child process
    let _ = child.kill();

    // Verify JSON output
    // We trim to handle different newline characters (\r\n vs \n) across OSs
    assert!(
        line.trim().contains(r#"{"type":"ready"}"#),
        "First message was not ready signal: {}",
        line
    );
}