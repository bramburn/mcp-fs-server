use std::io::BufRead;
use std::io::BufReader;
use std::process::Command;
use std::process::Stdio;

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

    let target_dir = if cfg!(windows) {
        "target/release/clipboard-monitor.exe"
    } else {
        "target/release/clipboard-monitor"
    };

    let mut child = Command::new(target_dir)
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
    assert!(
        line.contains(r#"{"type":"ready"}"#),
        "First message was not ready signal: {}",
        line
    );
}

