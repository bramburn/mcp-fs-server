use anyhow::{Context, Result};
use arboard::Clipboard;
use std::env;
use std::io::{self, Read};

/// Request payload for copying files via stdin
#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct FileCopyRequest {
    files: Vec<String>,
}

fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();

    // Support both CLI args and JSON via stdin
    let file_paths = if args.len() >= 2 {
        args[1..].to_vec()
    } else {
        // Try reading JSON from stdin
        let mut stdin_input = String::new();
        io::stdin().read_to_string(&mut stdin_input)?;

        if stdin_input.trim().is_empty() {
            anyhow::bail!("Usage: {} <file1> [file2...] OR provide JSON via stdin", args[0]);
        }

        let request: FileCopyRequest = serde_json::from_str(&stdin_input)
            .context("Failed to parse JSON from stdin")?;
        request.files
    };

    // Validate all files exist
    for path in &file_paths {
        let metadata = std::fs::metadata(path)
            .with_context(|| format!("File not found or inaccessible: {}", path))?;

        if !metadata.is_file() {
            anyhow::bail!("Path is not a file: {}", path);
        }
    }

    let mut clipboard = Clipboard::new()
        .context("Failed to access system clipboard")?;

    // Use arboard's cross-platform file_list method
    // Convert String paths to Path references
    let paths: Vec<&std::path::Path> = file_paths
        .iter()
        .map(|p| std::path::Path::new(p))
        .collect();

    clipboard.set().file_list(&paths)
        .context("Failed to copy files to clipboard")?;

    println!("✅ Successfully copied {} files to clipboard", file_paths.len());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_parsing() {
        let json = r#"{"files": ["/tmp/test1.txt", "/tmp/test2.txt"]}"#;
        let request: FileCopyRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.files.len(), 2);
    }
}

